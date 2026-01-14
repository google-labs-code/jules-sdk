/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Activity } from '../types.js';
import { getRootDir } from './root.js';
import { GlobalCacheMetadata, SessionMetadata } from './types.js';

/**
 * Represents the cache information for a single session.
 */
export type SessionCacheInfo = {
  sessionId: string;
  activityCount: number;
  lastSyncedAt: Date;
};

/**
 * Represents global cache information.
 */
export type GlobalCacheInfo = {
  lastSyncedAt: Date;
  sessionCount: number;
};

const GLOBAL_METADATA_FILE = 'global-metadata.json';

/**
 * Retrieves cache information for a specific session.
 *
 * @param sessionId - The ID of the session.
 * @returns A promise that resolves with the session's cache information, or null if not found.
 */
export async function getSessionCacheInfo(
  sessionId: string,
  rootDirOverride?: string,
): Promise<SessionCacheInfo | null> {
  const rootDir = rootDirOverride ?? getRootDir();
  const sessionDir = path.join(rootDir, '.jules/cache', sessionId);
  const sessionPath = path.join(sessionDir, 'session.json');
  const metadataPath = path.join(sessionDir, 'metadata.json');

  try {
    const sessionContent = await fs.readFile(sessionPath, 'utf8');
    const sessionData = JSON.parse(sessionContent);
    const lastSyncedAt = new Date(sessionData._lastSyncedAt);

    let activityCount = 0;
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata: SessionMetadata = JSON.parse(metadataContent);
      activityCount = metadata.activityCount;
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        console.warn(`Could not read metadata for session ${sessionId}:`, e);
      }
      // If metadata.json doesn't exist, activityCount remains 0.
    }

    return {
      sessionId,
      activityCount,
      lastSyncedAt,
    };
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      return null; // Session not found
    }
    throw e;
  }
}

/**
 * The legacy implementation of getCacheInfo that scans all session directories.
 * Used as a fallback during migration.
 */
async function getCacheInfoLegacy(
  rootDirOverride?: string,
): Promise<GlobalCacheInfo> {
  const rootDir = rootDirOverride ?? getRootDir();
  const cacheDir = path.join(rootDir, '.jules/cache');
  let lastSyncedAt = new Date(0);
  let sessionCount = 0;

  try {
    const sessionDirs = await fs.readdir(cacheDir, { withFileTypes: true });
    const sessionIds = sessionDirs
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    sessionCount = sessionIds.length;

    const syncTimes = await Promise.all(
      sessionIds.map(async (sessionId) => {
        const sessionPath = path.join(cacheDir, sessionId, 'session.json');
        try {
          const sessionContent = await fs.readFile(sessionPath, 'utf8');
          const sessionData = JSON.parse(sessionContent);
          return sessionData._lastSyncedAt as number;
        } catch {
          return 0;
        }
      }),
    );

    const mostRecentSync = Math.max(...syncTimes);
    if (mostRecentSync > 0) {
      lastSyncedAt = new Date(mostRecentSync);
    }
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
    // If the cache directory doesn't exist, return default values.
  }

  return {
    lastSyncedAt,
    sessionCount,
  };
}

export async function updateGlobalCacheMetadata(
  rootDirOverride?: string,
): Promise<void> {
  const rootDir = rootDirOverride ?? getRootDir();
  const cacheDir = path.join(rootDir, '.jules/cache');
  const metadataPath = path.join(cacheDir, GLOBAL_METADATA_FILE);

  // Read current or create new
  let metadata: GlobalCacheMetadata = { lastSyncedAt: 0, sessionCount: 0 };
  try {
    const content = await fs.readFile(metadataPath, 'utf8');
    metadata = JSON.parse(content);
  } catch {}

  // Update timestamp
  metadata.lastSyncedAt = Date.now();

  // Count sessions (only during update, not read)
  try {
    const entries = await fs.readdir(cacheDir, { withFileTypes: true });
    metadata.sessionCount = entries.filter((e) => e.isDirectory()).length;
  } catch {
    // If the directory doesn't exist, the count is 0.
    metadata.sessionCount = 0;
  }

  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(metadataPath, JSON.stringify(metadata), 'utf8');
}

// Update getCacheInfo to read from global metadata first (O(1))
export async function getCacheInfo(
  rootDirOverride?: string,
): Promise<GlobalCacheInfo> {
  const rootDir = rootDirOverride ?? getRootDir();
  const metadataPath = path.join(rootDir, '.jules/cache', GLOBAL_METADATA_FILE);

  try {
    const content = await fs.readFile(metadataPath, 'utf8');
    const metadata: GlobalCacheMetadata = JSON.parse(content);
    return {
      lastSyncedAt: new Date(metadata.lastSyncedAt),
      sessionCount: metadata.sessionCount,
    };
  } catch {
    // Fallback to scan (migration path)
    return getCacheInfoLegacy(rootDirOverride);
  }
}

export async function getSessionCount(
  rootDirOverride?: string,
): Promise<number> {
  const info = await getCacheInfo(rootDirOverride);
  return info.sessionCount;
}

export async function getActivityCount(
  sessionId: string,
  rootDirOverride?: string,
): Promise<number> {
  const info = await getSessionCacheInfo(sessionId, rootDirOverride);
  return info?.activityCount ?? 0;
}

export async function getLatestActivities(
  sessionId: string,
  n: number,
  rootDirOverride?: string,
): Promise<Activity[]> {
  const rootDir = rootDirOverride ?? getRootDir();
  const activitiesPath = path.join(
    rootDir,
    '.jules/cache',
    sessionId,
    'activities.jsonl',
  );

  const CHUNK_SIZE = 1024 * 8; // 8KB
  let fileHandle;
  try {
    fileHandle = await fs.open(activitiesPath, 'r');
    const stats = await fileHandle.stat();
    let position = stats.size;
    let buffer = Buffer.alloc(CHUNK_SIZE);
    let tail = '';
    const lines: string[] = [];

    while (position > 0 && lines.length < n) {
      const readSize = Math.min(position, CHUNK_SIZE);
      position -= readSize;

      await fileHandle.read(buffer, 0, readSize, position);
      const chunk = buffer.toString('utf8', 0, readSize);
      const combined = chunk + tail;
      const chunkLines = combined.split('\n');
      tail = chunkLines.shift() || '';

      for (let i = chunkLines.length - 1; i >= 0; i--) {
        if (chunkLines[i] && lines.length < n) {
          lines.unshift(chunkLines[i]);
        }
      }
    }

    if (lines.length < n && tail) {
      lines.unshift(tail);
    }

    const finalLines = lines.slice(-n).reverse();
    return finalLines.map((line) => JSON.parse(line));
  } catch (e: any) {
    if (e.code === 'ENOENT') return [];
    throw e;
  } finally {
    await fileHandle?.close();
  }
}
