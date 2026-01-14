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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as yaml from 'yaml';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  getActivityCount,
  getLatestActivities,
  getSessionCount,
} from '../../src/storage/cache-info.js';
import {
  NodeSessionStorage,
  NodeFileStorage,
} from '../../src/storage/node-fs.js';
import {
  Activity,
  JulesClient,
  JulesQuery,
  SessionResource,
} from '../../src/types.js';
import { select } from '../../src/query/select.js';

// Mock fs/promises for EFF-02 O(1) verification
vi.mock('fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    readdir: vi.fn(actual.readdir),
    readFile: vi.fn(actual.readFile),
  };
});

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

const specFile = await fs.readFile('spec/efficient-queries/cases.yaml', 'utf8');
const testCases = yaml.parse(specFile) as TestCase[];

describe('Efficient Queries Specs', () => {
  const efficientQueriesSpecCases = testCases.filter(
    (tc) =>
      tc.status === 'implemented' &&
      tc.testedIn?.includes('tests/efficient-queries/spec.test.ts'),
  );

  beforeEach(async () => {
    await fs.rm('tests/temp/efficient-queries', {
      recursive: true,
      force: true,
    });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm('tests/temp/efficient-queries', {
      recursive: true,
      force: true,
    });
  });

  for (const tc of efficientQueriesSpecCases) {
    it(
      tc.id,
      async () => {
        const rootDir = `tests/temp/efficient-queries/${tc.id}`;
        await fs.mkdir(rootDir, { recursive: true });

        if (tc.when === 'getActivityCount') {
          // EFF-01: Activity count without full scan
          const { sessionId, cachedActivities } = tc.given;
          const sessionStorage = new NodeSessionStorage(rootDir);
          const activityStorage = new NodeFileStorage(sessionId, rootDir);

          const mockSession: Partial<SessionResource> = {
            id: sessionId,
            title: 'Test Session',
            state: 'completed',
            createTime: new Date().toISOString(),
            sourceContext: { source: 'test' },
          };
          await sessionStorage.upsert(mockSession as SessionResource);

          for (let i = 0; i < cachedActivities; i++) {
            await activityStorage.append({
              id: `act-${i}`,
              type: 'userMessaged',
              message: 'hello',
            } as Activity);
          }

          const scanSpy = vi.spyOn(NodeFileStorage.prototype, 'scan');
          const count = await getActivityCount(sessionId, rootDir);

          expect(count).toBe(tc.then.result);

          if (
            tc.then.performance &&
            tc.then.performance.fullScanRequired === false
          ) {
            expect(scanSpy).not.toHaveBeenCalled();
          }
        } else if (tc.when === 'getSessionCount') {
          // EFF-02: Session count without full scan
          const cacheDir = path.join(rootDir, '.jules/cache');
          await fs.mkdir(cacheDir, { recursive: true });

          // Write global metadata file (O(1) read)
          const metadata = {
            lastSyncedAt: Date.now(),
            sessionCount: tc.given.cachedSessions,
          };
          await fs.writeFile(
            path.join(cacheDir, 'global-metadata.json'),
            JSON.stringify(metadata),
            'utf8',
          );

          // Clear mocks before the actual test call
          vi.mocked(fs.readdir).mockClear();

          const count = await getSessionCount(rootDir);
          expect(count).toBe(tc.then.result);

          // Verify O(1) - readdir NOT called when metadata exists
          if (
            tc.then.performance &&
            tc.then.performance.fullScanRequired === false
          ) {
            expect(vi.mocked(fs.readdir)).not.toHaveBeenCalled();
          }
        } else if (tc.when.startsWith('getLatestActivities')) {
          const n = parseInt(tc.when.match(/\d+/)?.[0] || '10');
          const { sessionId, activities, cachedActivities } = tc.given;

          const activityStorage = new NodeFileStorage(sessionId, rootDir);

          if (activities) {
            // EFF-03: specific activities with createTime
            for (const act of activities) {
              await activityStorage.append({
                id: act.id,
                type: 'progressUpdated',
                createTime: act.createTime,
              } as Activity);
            }
          } else if (cachedActivities) {
            // EFF-04: large dataset
            for (let i = 0; i < cachedActivities; i++) {
              await activityStorage.append({
                id: `act-${i}`,
                type: 'progressUpdated',
                createTime: new Date(Date.now() + i * 1000).toISOString(),
              } as Activity);
            }
          }

          const readFileSpy = vi.mocked(fs.readFile);
          const result = await getLatestActivities(sessionId, n, rootDir);

          if (
            tc.then.performance &&
            tc.then.performance.fullScanRequired === false
          ) {
            expect(readFileSpy).not.toHaveBeenCalledWith(
              expect.stringContaining('activities.jsonl'),
              'utf8',
            );
          }

          if (tc.then.result) {
            expect(result.map((a) => a.id)).toEqual(
              tc.then.result.map((r: any) => r.id),
            );
          }
          if (tc.then.resultCount) {
            expect(result.length).toBe(tc.then.resultCount);
          }
        } else if (tc.when === 'select') {
          const { sessionId, activities, options } = tc.given;
          const activityStorage = new NodeFileStorage(sessionId, rootDir);
          const sessionStorage = new NodeSessionStorage(rootDir);

          // Create activities
          for (const act of activities) {
            await activityStorage.append({
              id: act.id,
              type: 'progressUpdated',
              createTime: act.createTime,
            } as Activity);
          }
          // create a mock client
          const mockClient: JulesClient = {
            storage: sessionStorage,
            session: (id: string) =>
              ({
                activities: {
                  select: async () => {
                    const storage = new NodeFileStorage(id, rootDir);
                    const acts: Activity[] = [];
                    for await (const activity of storage.scan()) {
                      acts.push(activity);
                    }
                    return acts;
                  },
                },
                info: async () => {
                  const storage = new NodeSessionStorage(rootDir);
                  const sess = await storage.get(id);
                  return sess!.resource;
                },
              }) as any,
          } as any;

          // Run select query
          const query: JulesQuery<'activities'> = {
            from: 'activities',
            where: { sessionId },
            order: options?.order,
          };
          const result = await select(mockClient, query);

          if (tc.then.firstResultId) {
            expect(result[0].id).toBe(tc.then.firstResultId);
          }
          if (tc.then.lastResultId) {
            expect(result[result.length - 1].id).toBe(tc.then.lastResultId);
          }
        } else if (tc.when === 'jules.select') {
          const { sessionId, activities, query: queryArgs } = tc.given;

          const activityStorage = new NodeFileStorage(sessionId, rootDir);
          const sessionStorage = new NodeSessionStorage(rootDir);
          // Create activities
          for (const act of activities) {
            await activityStorage.append({
              id: act.id,
              type: 'progressUpdated',
              createTime: act.createTime,
            } as Activity);
          }

          // Create mock client
          const mockClient: JulesClient = {
            storage: sessionStorage,
            session: (id: string) =>
              ({
                activities: {
                  select: async () => {
                    const storage = new NodeFileStorage(id, rootDir);
                    const acts: Activity[] = [];
                    for await (const activity of storage.scan()) {
                      acts.push(activity);
                    }
                    return acts;
                  },
                },
              }) as any,
          } as any;

          // Run select query using the query from the test case
          const result = await select(mockClient, queryArgs);

          // Assertions from the test case
          if (tc.then.resultIds) {
            expect(result.map((r) => r.id)).toEqual(tc.then.resultIds);
          }
        }
      },
      30000,
    );
  }
});
