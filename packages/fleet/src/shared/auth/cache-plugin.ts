// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

interface CacheEntry {
  etag?: string;
  data: unknown;
}

const DEFAULT_GET_TTL_MS = 5 * 60 * 1000;      // 5 minutes (GET — cheap ETag revalidation)
const DEFAULT_POST_TTL_MS = 30 * 60 * 1000;    // 30 minutes (POST — no ETag, full refetch)

// ── Reverse index: hash → url (populated by cachePlugin, read by invalidateEntries) ──
const urlIndex = new Map<string, string>();

function getCacheDir(): string {
  return process.env.FLEET_CACHE_DIR ?? join(tmpdir(), 'fleet-cache');
}

/**
 * Invalidate cache entries whose URL contains any of the given patterns.
 * Returns the number of entries evicted.
 */
export function invalidateEntries(patterns: string[]): number {
  if (patterns.length === 0) return 0;
  const cacheDir = getCacheDir();
  if (!existsSync(cacheDir)) return 0;

  let evicted = 0;
  const evictedHashes = new Set<string>();

  // Strategy 1: Use the in-memory reverse index (same process)
  for (const [hash, url] of urlIndex.entries()) {
    if (patterns.some(p => url.includes(p))) {
      try { unlinkSync(join(cacheDir, `${hash}.json`)); } catch { /* ok */ }
      try { unlinkSync(join(cacheDir, `${hash}.url`)); } catch { /* ok */ }
      urlIndex.delete(hash);
      evictedHashes.add(hash);
      evicted++;
    }
  }

  // Strategy 2: Scan disk for entries not in the index (cross-process invalidation)
  try {
    const files = readdirSync(cacheDir);
    for (const file of files) {
      if (!file.endsWith('.url')) continue;
      const hash = file.replace('.url', '');
      if (evictedHashes.has(hash)) continue; // already handled by Strategy 1
      const urlFilePath = join(cacheDir, file);
      try {
        const storedUrl = readFileSync(urlFilePath, 'utf8');
        if (patterns.some(p => storedUrl.includes(p))) {
          try { unlinkSync(join(cacheDir, `${hash}.json`)); } catch { /* ok */ }
          try { unlinkSync(urlFilePath); } catch { /* ok */ }
          evicted++;
        }
      } catch {
        // Non-fatal
      }
    }
  } catch {
    // Non-fatal
  }

  return evicted;
}

/**
 * Filesystem-backed Octokit cache plugin with TTL + ETag.
 *
 * Two-layer caching:
 *  1. TTL layer: If a cache file is < TTL old, return instantly from disk
 *     (zero network). GET default 5 min, POST default 30 min.
 *     Override with FLEET_CACHE_TTL (seconds, applies to both).
 *  2. ETag layer: If TTL expired AND response had an ETag, send If-None-Match.
 *     304 responses don't count against rate limits; on 304 we touch the file
 *     to reset TTL.
 *
 * POST/GraphQL: Cached by request body hash (TTL-only, no ETag revalidation).
 *
 * Cache dir: $TMPDIR/fleet-cache/ (or FLEET_CACHE_DIR env var)
 * Set FLEET_CACHE=0 to disable entirely.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cachePlugin(octokit: any) {
  if (process.env.FLEET_CACHE === '0') return;

  const cacheDir = getCacheDir();
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  const customTtl = process.env.FLEET_CACHE_TTL
    ? Number(process.env.FLEET_CACHE_TTL) * 1000
    : null;
  const getTtlMs = customTtl ?? DEFAULT_GET_TTL_MS;
  const postTtlMs = customTtl ?? DEFAULT_POST_TTL_MS;

  const timing = process.env.FLEET_TIMING === '1';
  let hits = 0;
  let misses = 0;
  let revalidations = 0;

  function cacheKey(options: any): string {
    const stable: Record<string, unknown> = {
      method: options.method,
      url: options.url,
    };

    for (const [k, v] of Object.entries(options)) {
      if (['headers', 'request', 'mediaType'].includes(k)) continue;
      stable[k] = v;
    }

    if (options.data) {
      stable._body = typeof options.data === 'string'
        ? options.data
        : JSON.stringify(options.data);
    }

    return createHash('sha1').update(JSON.stringify(stable)).digest('hex');
  }

  function getFilePath(key: string): string {
    return join(cacheDir, `${key}.json`);
  }

  function readEntry(key: string): { entry: CacheEntry; ageMs: number } | null {
    const p = getFilePath(key);
    if (!existsSync(p)) return null;
    try {
      const stat = statSync(p);
      const ageMs = Date.now() - stat.mtimeMs;
      const entry: CacheEntry = JSON.parse(readFileSync(p, 'utf8'));
      return { entry, ageMs };
    } catch {
      return null;
    }
  }

  function writeEntry(key: string, entry: CacheEntry, url: string): void {
    try {
      writeFileSync(getFilePath(key), JSON.stringify(entry), 'utf8');
      // Write companion .url file for cross-process invalidation lookups
      writeFileSync(join(cacheDir, `${key}.url`), url, 'utf8');
      // Update in-memory reverse index
      urlIndex.set(key, url);
    } catch {
      // Non-fatal
    }
  }

  function touchFile(key: string): void {
    const p = getFilePath(key);
    try {
      const content = readFileSync(p, 'utf8');
      writeFileSync(p, content, 'utf8');
    } catch {
      // Non-fatal
    }
  }

  octokit.hook.wrap('request', async (request: any, options: any) => {
    const key = cacheKey(options);
    const cached = readEntry(key);
    const isPost = options.method === 'POST';
    const ttlMs = isPost ? postTtlMs : getTtlMs;

    // ── ETag-first: always revalidate GETs when we have an ETag ────
    // 304 responses are free (no rate limit hit, ~50ms round-trip).
    // TTL only applies as fallback for POST/GraphQL (no ETag support).
    if (cached && cached.entry.etag && !isPost) {
      revalidations++;
      options.headers = {
        ...options.headers,
        'if-none-match': cached.entry.etag,
      };
    } else if (cached && isPost && cached.ageMs < ttlMs) {
      // POST/GraphQL: TTL fallback (no ETag available)
      hits++;
      urlIndex.set(key, options.url);
      return { data: cached.entry.data, status: 200, headers: {} };
    } else {
      misses++;
    }

    try {
      const response = await request(options);
      const etag = response.headers?.etag;
      writeEntry(key, { etag: etag || undefined, data: response.data }, options.url);
      return response;
    } catch (error: any) {
      if (error.status === 304 && cached) {
        touchFile(key);
        urlIndex.set(key, options.url);
        return { data: cached.entry.data, status: 200, headers: {} };
      }
      throw error;
    }
  });

  // Print cache stats at process exit when timing is enabled
  if (timing) {
    process.on('beforeExit', () => {
      console.error(`  ⏱  cache: ${hits} TTL hits, ${revalidations} revalidations, ${misses} cold misses`);
    });
  }
}
