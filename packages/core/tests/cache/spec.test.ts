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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as yaml from 'yaml';
import * as fs from 'fs/promises';
import * as path from 'path';

import * as fsPromises from 'fs/promises';

vi.mock('fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    readdir: vi.fn(actual.readdir),
  };
});

import {
  getCacheInfo,
  getSessionCacheInfo,
} from '../../src/storage/cache-info.js';
import {
  NodeSessionStorage,
  NodeFileStorage,
} from '../../src/storage/node-fs.js';
import { Activity, SessionResource } from '../../src/types.js';

type TestCase = {
  id: string;
  description: string;
  category: string;
  status: 'pending' | 'implemented';
  testedIn?: string;
  given: any;
  when: string;
  then: any;
};

const specFile = await fs.readFile('spec/cache-freshness/cases.yaml', 'utf8');
const testCases = yaml.parse(specFile) as TestCase[];

describe('Cache Freshness Specs', () => {
  const cacheSpecCases = testCases.filter(
    (tc) =>
      tc.status === 'implemented' &&
      tc.testedIn?.includes('tests/cache/spec.test.ts'),
  );

  beforeEach(async () => {
    await fs.rm('tests/temp/cache-freshness', { recursive: true, force: true });
    vi.clearAllMocks();
  });

  for (const tc of cacheSpecCases) {
    it(tc.id, async () => {
      // Mock storage
      const rootDir = `tests/temp/cache-freshness/${tc.id}`;
      await fs.mkdir(rootDir, { recursive: true });

      if (tc.when === 'getCacheInfo') {
        if (tc.id === 'FRESH-06') {
          const cacheDir = path.join(rootDir, '.jules/cache');
          await fs.mkdir(cacheDir, { recursive: true });

          // DO NOT create session directories. This proves the test
          // is reading from the metadata file and not scanning the
          // directory (which would return 0).

          // Write global metadata file
          const metadata = {
            lastSyncedAt: Date.now(),
            sessionCount: tc.given.cachedSessions,
          };
          await fs.writeFile(
            path.join(cacheDir, 'global-metadata.json'),
            JSON.stringify(metadata),
            'utf8',
          );

          const info = await getCacheInfo(rootDir);

          expect(info.lastSyncedAt.getTime()).toBeGreaterThan(0);
          expect(info.sessionCount).toBe(tc.given.cachedSessions);

          // Verify O(1) behavior - readdir should NOT be called when metadata exists
          expect(vi.mocked(fsPromises.readdir)).not.toHaveBeenCalled();
        } else {
          const sessionStorage = new NodeSessionStorage(rootDir);
          if (tc.given.syncPerformed) {
            const mockSession: Partial<SessionResource> = {
              id: tc.given.sessionId,
              title: 'Test Session',
              state: 'completed',
              createTime: new Date().toISOString(),
              sourceContext: { source: 'test' },
            };
            await sessionStorage.upsert(mockSession as SessionResource);
          }
          const info = await getCacheInfo(rootDir);
          expect(info.lastSyncedAt).toBeInstanceOf(Date);
          if (tc.given.syncPerformed) {
            expect(info.lastSyncedAt.getTime()).toBeGreaterThan(0);
          } else {
            expect(info.lastSyncedAt.getTime()).toBe(0);
          }
        }
      } else if (tc.when === 'getSessionCacheInfo') {
        const sessionStorage = new NodeSessionStorage(rootDir);
        const activityStorage = new NodeFileStorage(
          tc.given.sessionId,
          rootDir,
        );

        const mockSession: Partial<SessionResource> = {
          id: tc.given.sessionId,
          title: 'Test Session',
          state: 'completed',
          createTime: new Date().toISOString(),
          sourceContext: { source: 'test' },
        };
        await sessionStorage.upsert(mockSession as SessionResource);

        const activitiesToSync =
          tc.given.activitiesSynced ?? tc.given.cachedActivities ?? 0;
        for (let i = 0; i < activitiesToSync; i++) {
          await activityStorage.append({
            id: `act-${i}`,
            type: 'userMessaged',
            message: 'hello',
          } as Activity);
        }

        const scanSpy = vi.spyOn(activityStorage, 'scan');
        const info = await getSessionCacheInfo(tc.given.sessionId, rootDir);

        expect(info).not.toBeNull();
        expect(info?.sessionId).toBe(tc.given.sessionId);
        expect(info?.lastSyncedAt).toBeInstanceOf(Date);
        expect(info?.lastSyncedAt.getTime()).toBeGreaterThan(0);

        if (tc.then.result.activityCount) {
          expect(info?.activityCount).toBe(tc.then.result.activityCount);
        }

        if (
          tc.then.performance &&
          tc.then.performance.fullScanRequired === false
        ) {
          expect(scanSpy).not.toHaveBeenCalled();
        }
      }
    });
  }
});
