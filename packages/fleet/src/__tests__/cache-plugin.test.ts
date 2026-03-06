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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { cachePlugin, invalidateEntries } from '../shared/auth/cache-plugin.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Create a unique temp cache dir for each test */
function makeTempCacheDir(): string {
  const dir = join(tmpdir(), `fleet-cache-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Create a mock octokit with configurable hook.wrap behavior.
 * The plugin calls `octokit.hook.wrap('request', handler)` — we
 * capture that handler and expose a way to invoke it with test options.
 */
function createMockOctokit() {
  let wrappedHandler: ((request: any, options: any) => Promise<any>) | null = null;

  const octokit = {
    hook: {
      wrap: (_name: string, handler: any) => {
        wrappedHandler = handler;
      },
    },
  };

  /** Simulate a request through the cache plugin */
  async function makeRequest(
    options: { method: string; url: string; data?: any; [k: string]: any },
    mockResponse: { data: any; status: number; headers: Record<string, string> },
  ) {
    if (!wrappedHandler) throw new Error('Plugin not installed');
    const request = vi.fn().mockResolvedValue(mockResponse);
    return { result: await wrappedHandler(request, { ...options }), request };
  }

  return { octokit, makeRequest };
}

// ── Test 1: POST responses use longer TTL ────────────────────────────

describe('cache-plugin: POST TTL', () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = makeTempCacheDir();
    process.env.FLEET_CACHE_DIR = cacheDir;
    delete process.env.FLEET_CACHE;
    delete process.env.FLEET_CACHE_TTL;
    delete process.env.FLEET_TIMING;
  });

  afterEach(() => {
    delete process.env.FLEET_CACHE_DIR;
  });

  it('serves POST /graphql from disk when age < 30 min (POST TTL)', async () => {
    const { octokit, makeRequest } = createMockOctokit();
    cachePlugin(octokit);

    const gqlOptions = { method: 'POST', url: '/graphql', data: { query: '{ viewer { login } }' } };
    const apiResponse = { data: { data: { viewer: { login: 'test' } } }, status: 200, headers: {} };

    // 1. Cold miss — response should be fetched from network
    const { request: req1 } = await makeRequest(gqlOptions, apiResponse);
    expect(req1).toHaveBeenCalledTimes(1); // network hit

    // 2. Age the cache entry to 10 minutes (past 5-min GET TTL, within 30-min POST TTL)
    const files = readdirSync(cacheDir);
    expect(files.length).toBeGreaterThan(0);
    const filePath = join(cacheDir, files[0]);
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(filePath, tenMinAgo, tenMinAgo);

    // 3. Second request — should be TTL hit (no network) because POST TTL is 30 min
    const { request: req2, result } = await makeRequest(gqlOptions, apiResponse);
    expect(req2).not.toHaveBeenCalled(); // NO network hit — served from disk
    expect(result.data).toEqual(apiResponse.data);
  });

  it('refetches GET responses after 5-min TTL expires (uses shorter TTL)', async () => {
    const { octokit, makeRequest } = createMockOctokit();
    cachePlugin(octokit);

    const getOptions = { method: 'GET', url: '/repos/owner/repo/pulls/145' };
    const apiResponse = { data: { id: 145 }, status: 200, headers: { etag: 'W/"abc123"' } };

    // 1. Cold miss
    await makeRequest(getOptions, apiResponse);

    // 2. Age the cache entry to 6 minutes (past 5-min GET TTL)
    const files = readdirSync(cacheDir);
    const filePath = join(cacheDir, files[0]);
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000);
    utimesSync(filePath, sixMinAgo, sixMinAgo);

    // 3. Should NOT be TTL hit — should attempt ETag revalidation (network call)
    const { request: req2 } = await makeRequest(getOptions, apiResponse);
    expect(req2).toHaveBeenCalledTimes(1); // network call made
  });
});

// ── Test 2: Granular invalidation ────────────────────────────────────

describe('cache-plugin: invalidateEntries', () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = makeTempCacheDir();
    process.env.FLEET_CACHE_DIR = cacheDir;
    delete process.env.FLEET_CACHE;
    delete process.env.FLEET_CACHE_TTL;
    delete process.env.FLEET_TIMING;
  });

  afterEach(() => {
    delete process.env.FLEET_CACHE_DIR;
  });

  it('evicts only cache entries whose URL matches the patterns', async () => {
    const { octokit, makeRequest } = createMockOctokit();
    cachePlugin(octokit);

    // Populate cache with two different GET requests
    const pr145Options = { method: 'GET', url: '/repos/owner/repo/pulls/145' };
    const pr200Options = { method: 'GET', url: '/repos/owner/repo/pulls/200' };
    const response = { data: { id: 0 }, status: 200, headers: { etag: 'W/"etag"' } };

    await makeRequest(pr145Options, response);
    await makeRequest(pr200Options, response);

    // Verify both entries exist
    const filesBefore = readdirSync(cacheDir).filter(f => f.endsWith('.json'));
    expect(filesBefore.length).toBe(2);

    // Invalidate only PR 145
    const evicted = invalidateEntries(['/repos/owner/repo/pulls/145']);
    expect(evicted).toBe(1);

    // PR 200 should still be cached
    const filesAfter = readdirSync(cacheDir).filter(f => f.endsWith('.json'));
    expect(filesAfter.length).toBe(1);

    // Requesting PR 200 should revalidate with ETag (not evicted, but always revalidates)
    const { request: req200 } = await makeRequest(pr200Options, response);
    expect(req200).toHaveBeenCalledTimes(1); // ETag revalidation (not TTL hit)
    expect(req200).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'if-none-match': 'W/"etag"',
        }),
      }),
    );

    // Requesting PR 145 should be cold miss (evicted — no cached entry, no ETag)
    const { request: req145 } = await makeRequest(pr145Options, response);
    expect(req145).toHaveBeenCalledTimes(1); // network hit (cold miss)
  });
});

// ── Test 3: applyFixMode returns mutatedUrls ──────────────────────────

describe('applyFixMode: mutated URLs', () => {
  it('returns mutatedUrls for each fix applied', async () => {
    // Import dynamically to avoid side effects
    const { applyFixMode } = await import('../audit/pipeline/apply-fix-mode.js');

    const mockOctokit = {
      rest: {
        issues: {
          addLabels: vi.fn().mockResolvedValue({}),
        },
      },
    } as any;

    const input = {
      owner: 'davideast',
      repo: 'jules-sdk-python',
      baseBranch: 'main',
      entryPoint: { kind: 'full' as const },
      fixMode: 'apply' as const,
      depth: 2,
      format: 'human' as const,
      includeGraph: false,
    };

    const findings = [
      {
        nodeId: 'pr:145',
        type: 'pr:missing-label',
        severity: 'error',
        message: 'PR #145 missing fleet-merge-ready label',
        fixability: 'deterministic',
        fixed: false,
      },
    ] as any;

    const result = await applyFixMode(mockOctokit, input, findings);

    // Current signature returns a number — this test expects the NEW signature
    // to return { fixedCount, mutatedUrls }
    expect(result).toEqual(
      expect.objectContaining({
        fixedCount: 1,
        mutatedUrls: expect.arrayContaining([
          expect.stringContaining('/repos/davideast/jules-sdk-python/pulls/145'),
          '/graphql', // GraphQL cache contains bulk PR data including labels
        ]),
      }),
    );
  });
});

// ── Test 4: ETag-first revalidation (TTL must NOT block ETag checks) ──

describe('cache-plugin: ETag-first revalidation', () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = makeTempCacheDir();
    process.env.FLEET_CACHE_DIR = cacheDir;
    delete process.env.FLEET_CACHE;
    delete process.env.FLEET_CACHE_TTL;
    delete process.env.FLEET_TIMING;
  });

  afterEach(() => {
    delete process.env.FLEET_CACHE_DIR;
  });

  it('GET with ETag always revalidates — even within TTL window', async () => {
    const { octokit, makeRequest } = createMockOctokit();
    cachePlugin(octokit);

    const getOptions = { method: 'GET', url: '/repos/owner/repo/issues' };
    const response1 = {
      data: [{ number: 1, labels: [] }],
      status: 200,
      headers: { etag: 'W/"etag-v1"' },
    };

    // 1. Cold miss — populates cache with ETag
    const { request: req1 } = await makeRequest(getOptions, response1);
    expect(req1).toHaveBeenCalledTimes(1);

    // 2. Immediately request again — cache entry is 0ms old (well within 5-min TTL)
    //    Server has updated data with a new ETag
    const response2 = {
      data: [{ number: 1, labels: ['fleet'] }], // label was added externally
      status: 200,
      headers: { etag: 'W/"etag-v2"' },
    };

    const { request: req2, result } = await makeRequest(getOptions, response2);

    // ❌ CURRENT BUG: request is NOT made because TTL gate blocks it
    // ✅ CORRECT: request SHOULD be made with If-None-Match header
    expect(req2).toHaveBeenCalledTimes(1);
    expect(req2).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'if-none-match': 'W/"etag-v1"',
        }),
      }),
    );

    // Should return the FRESH data, not the stale cached data
    expect(result.data).toEqual([{ number: 1, labels: ['fleet'] }]);
  });

  it('GET with ETag returns cached data on 304 (no rate limit hit)', async () => {
    const { octokit, makeRequest } = createMockOctokit();
    cachePlugin(octokit);

    const getOptions = { method: 'GET', url: '/repos/owner/repo/issues' };
    const originalData = [{ number: 1, labels: ['fleet'] }];
    const response1 = {
      data: originalData,
      status: 200,
      headers: { etag: 'W/"etag-v1"' },
    };

    // 1. Cold miss — populates cache
    await makeRequest(getOptions, response1);

    // 2. Server returns 304 (data unchanged)
    //    Octokit surfaces 304 as an error with status property
    const { octokit: octokit2, makeRequest: makeRequest2 } = createMockOctokit();
    cachePlugin(octokit2);

    // Re-populate cache for octokit2
    await makeRequest2(getOptions, response1);

    // Now simulate 304: the mock request function throws with status 304
    let wrappedHandler: any;
    const octokit3 = {
      hook: {
        wrap: (_name: string, handler: any) => { wrappedHandler = handler; },
      },
    };
    cachePlugin(octokit3);

    // Construct request that throws 304
    const request304 = vi.fn().mockRejectedValue(Object.assign(new Error('Not Modified'), { status: 304 }));

    // Must have a cached entry first
    const requestOk = vi.fn().mockResolvedValue(response1);
    await wrappedHandler(requestOk, { ...getOptions });

    // Now revalidate — should get 304 and return cached data
    const result = await wrappedHandler(request304, { ...getOptions });
    expect(result.data).toEqual(originalData);
    expect(result.status).toBe(200);
  });

  it('POST/GraphQL still uses TTL — no ETag available', async () => {
    const { octokit, makeRequest } = createMockOctokit();
    cachePlugin(octokit);

    const postOptions = { method: 'POST', url: '/graphql', data: { query: '{ viewer }' } };
    const response = { data: { data: { viewer: 'test' } }, status: 200, headers: {} };

    // 1. Cold miss
    const { request: req1 } = await makeRequest(postOptions, response);
    expect(req1).toHaveBeenCalledTimes(1);

    // 2. Second request immediately — POST should still use TTL (no ETag to revalidate)
    const { request: req2 } = await makeRequest(postOptions, response);
    expect(req2).not.toHaveBeenCalled(); // TTL hit — correct for POST
  });
});

// ── Test 5: Live GitHub API integration (opt-in) ──────────────────────

describe('cache-plugin: live GitHub API', () => {
  const LIVE = process.env.FLEET_TEST_LIVE === '1';

  it.skipIf(!LIVE)('ETag revalidation works with real GitHub API', async () => {
    const { Octokit } = await import('octokit');
    const { cachePlugin: realCachePlugin } = await import('../shared/auth/cache-plugin.js');

    const cacheDir = makeTempCacheDir();
    process.env.FLEET_CACHE_DIR = cacheDir;

    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
    realCachePlugin(octokit);

    // Fetch the same endpoint twice — second should use ETag
    const endpoint = '/repos/davideast/jules-sdk-python/issues?state=open&per_page=5';
    const r1 = await octokit.request(`GET ${endpoint}`);
    expect(r1.status).toBe(200);

    const r2 = await octokit.request(`GET ${endpoint}`);
    // Should still get data (from cache or fresh) — no errors
    expect(r2.data).toBeDefined();
    expect(Array.isArray(r2.data)).toBe(true);

    // The cache dir should have entries
    const files = readdirSync(cacheDir);
    expect(files.length).toBeGreaterThan(0);

    delete process.env.FLEET_CACHE_DIR;
  });
});

