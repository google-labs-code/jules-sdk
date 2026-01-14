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

/**
 * Spec-Driven Test Runner
 *
 * This file consumes test cases from spec/sync/cases.yaml and runs them
 * automatically. Test cases are defined declaratively with given/when/then.
 *
 * Benefits:
 * - Single source of truth for test cases
 * - Easy to add new cases without writing test code
 * - Status tracking (implemented/pending/skipped)
 * - Auto-generates test descriptions from spec IDs
 *
 * Usage:
 *   npm test -- tests/sync/spec.test.ts
 *   npm test -- tests/sync/spec.test.ts --grep "HWM-01"
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { JulesClientImpl } from '../../src/client.js';
import { SyncInProgressError } from '../../src/errors.js';
import { ApiClient } from '../../src/api.js';
import { getRootDir } from '../../src/storage/root.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: vi.fn(actual.homedir),
  };
});

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    accessSync: vi.fn(actual.accessSync),
    mkdirSync: vi.fn(actual.mkdirSync),
    writeFileSync: vi.fn(actual.writeFileSync),
    appendFileSync: vi.fn(actual.appendFileSync),
  };
});

// =============================================================================
// Types
// =============================================================================

interface TestCase {
  id: string;
  description: string;
  category: string;
  status: 'implemented' | 'pending' | 'skipped';
  testedIn?: string; // If set, test is run elsewhere (skip in spec runner)
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  given: {
    localSessions?: Array<{ id: string; createTime: string }>;
    apiSessions?: Array<{ id: string; createTime?: string; _generate?: any }>;
    apiResponses?: Array<{ status: number; body?: any; count?: number }>;
    sessionActivities?: Record<string, Array<{ id: string }>>;
    localActivities?: Record<
      string,
      Array<{ id: string; createTime?: string }>
    >;
    serverActivities?: Record<
      string,
      Array<{ id: string; createTime?: string }>
    >;
    options?: Record<string, unknown>;
    checkpoint?: Record<string, unknown>;
    syncInProgress?: boolean;
    abortAfterSessions?: number;
    cwd?: string;
    hasPackageJson?: boolean;
    env?: Record<string, string>;
    homeWritable?: boolean;
  };
  when: 'sync' | 'getRootDir';
  then: {
    stats?: {
      sessionsIngested?: number;
      activitiesIngested?: number;
      isComplete?: boolean;
    };
    calls?: Array<{ method: string; times: number }>;
    throws?: { error: string; status?: number } | null;
    delays?: number[];
    startedFromSession?: string;
    rootDir?: string;
    cacheDir?: string;
  };
}

// =============================================================================
// Load Test Cases from YAML
// =============================================================================

function loadTestCases(): TestCase[] {
  const yamlPath = join(__dirname, '../../spec/sync/cases.yaml');
  const content = readFileSync(yamlPath, 'utf-8');
  return parse(content) as TestCase[];
}

// =============================================================================
// Mock Factories
// =============================================================================

function createMockStorage() {
  const sessions = new Map<string, any>();
  const activities = new Map<string, any[]>();

  return {
    scanIndex: vi.fn(async function* () {
      for (const [id, session] of sessions) {
        yield { id, createTime: session.createTime };
      }
    }),
    upsert: vi.fn(async (session: any) => {
      sessions.set(session.id, session);
    }),
    get: vi.fn(async (id: string) => sessions.get(id)),
    // For test setup
    _seedSessions: (list: Array<{ id: string; createTime: string }>) => {
      for (const s of list) sessions.set(s.id, s);
    },
    _seedActivities: (sessionId: string, list: Array<{ id: string }>) => {
      activities.set(sessionId, list);
    },
    _getActivities: (sessionId: string) => activities.get(sessionId) || [],
  };
}

function createMockActivityStorage(
  activities: Array<{ id: string; createTime?: string }> = [],
) {
  let stored = [...activities];

  return {
    init: vi.fn(),
    close: vi.fn(),
    scan: vi.fn(async function* () {
      for (const act of stored) yield act;
    }),
    append: vi.fn(async (activity: any) => {
      stored.push(activity);
    }),
    latest: vi.fn(async () => stored[stored.length - 1]),
    get: vi.fn(async (id: string) => stored.find((a) => a.id === id)),
    // For inspection
    _getAll: () => stored,
  };
}

function createMockApiResponses(
  responses: Array<{ status: number; body?: any; count?: number }>,
) {
  let callIndex = 0;
  const expandedResponses: Array<{ status: number; body?: any }> = [];

  for (const r of responses) {
    if (r.count) {
      for (let i = 0; i < r.count; i++) {
        expandedResponses.push({ status: r.status, body: r.body });
      }
    } else {
      expandedResponses.push(r);
    }
  }

  return vi.fn(async () => {
    const response = expandedResponses[callIndex] ||
      expandedResponses[expandedResponses.length - 1] || {
        status: 200,
        body: { sessions: [] },
      };
    callIndex++;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.status === 429 ? 'Too Many Requests' : 'OK',
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
    };
  });
}

function expandSessions(
  sessions: any[],
): Array<{ id: string; createTime: string }> {
  const result: Array<{ id: string; createTime: string }> = [];

  for (const s of sessions) {
    if (s._generate) {
      const { count, template } = s._generate;
      for (let i = 0; i < count; i++) {
        result.push({
          id: template.id.replace('${i}', String(i)),
          createTime:
            template.createTime?.replace('${i}', String(i).padStart(2, '0')) ||
            new Date(Date.now() - i * 86400000).toISOString(),
        });
      }
    } else {
      result.push(s);
    }
  }

  return result;
}

// =============================================================================
// Test Executor
// =============================================================================

function executeTest(tc: TestCase) {
  return async () => {
    // Skip pending tests
    if (tc.status === 'pending') {
      console.log(`⏳ Skipping pending test: ${tc.id}`);
      return;
    }
    if (tc.status === 'skipped') {
      console.log(`⏭️ Skipping test: ${tc.id}`);
      return;
    }
    if (tc.testedIn) {
      console.log(`✅ [${tc.id}] Tested in: ${tc.testedIn}`);
      return;
    }

    if (tc.when === 'getRootDir') {
      const originalEnv = process.env;
      const originalCwd = process.cwd();

      try {
        if (tc.given.env) {
          process.env = { ...originalEnv, ...tc.given.env };
        }
        if (tc.given.cwd) {
          vi.spyOn(process, 'cwd').mockReturnValue(tc.given.cwd);
        }

        // Mock os.homedir to return a predictable value for tests
        vi.mocked(os.homedir).mockReturnValue(
          tc.given.env?.HOME || '/Users/test',
        );

        vi.mocked(fs.existsSync).mockImplementation((p: any) => {
          if (typeof p === 'string' && p.endsWith('package.json')) {
            return !!tc.given.hasPackageJson;
          }
          return false;
        });

        vi.mocked(fs.accessSync).mockImplementation((p: any) => {
          if (tc.given.homeWritable === false) {
            // If home is not writable, fail on anything that looks like home or root
            const home = tc.given.env?.HOME || '/Users/test';
            if (
              p === home ||
              p === '/nonexistent' ||
              p === '/root' ||
              p === '/'
            ) {
              throw new Error('EACCES');
            }
          }
        });

        const rootDir = getRootDir();

        if (tc.then.rootDir) {
          expect(rootDir).toBe(tc.then.rootDir);
        }
      } finally {
        process.env = originalEnv;
        vi.restoreAllMocks();
      }
      return;
    }

    // Setup mocks
    const mockStorage = createMockStorage();
    const mockActivityStorages = new Map<
      string,
      ReturnType<typeof createMockActivityStorage>
    >();

    // Seed local sessions
    if (tc.given.localSessions) {
      mockStorage._seedSessions(tc.given.localSessions);
    }

    // Seed local activities
    if (tc.given.localActivities) {
      for (const [sessionId, activities] of Object.entries(
        tc.given.localActivities,
      )) {
        mockActivityStorages.set(
          sessionId,
          createMockActivityStorage(activities),
        );
      }
    }

    // Create client
    const client = new JulesClientImpl(
      {},
      {
        session: () => mockStorage as any,
        activity: (sessionId: string) => {
          if (!mockActivityStorages.has(sessionId)) {
            mockActivityStorages.set(sessionId, createMockActivityStorage());
          }
          return mockActivityStorages.get(sessionId)! as any;
        },
      },
      { getEnv: vi.fn() } as any,
    );

    (client as any).apiClient = new ApiClient({
      apiKey: 'test',
      baseUrl: 'http://test',
      requestTimeoutMs: 1000,
    });

    // Mock apiClient.request to prevent real network calls and support apiResponses
    const mockResponses = tc.given.apiResponses || [];
    const mockApi = createMockApiResponses(mockResponses);
    vi.spyOn((client as any).apiClient, 'request').mockImplementation(mockApi);

    // Mock sessions() to return API sessions if provided
    if (tc.given.apiSessions) {
      const sessions = expandSessions(tc.given.apiSessions);
      vi.spyOn(client, 'sessions').mockImplementation(() => {
        return (async function* () {
          for (const s of sessions) yield s;
        })() as any;
      });
    } else if (!tc.given.apiResponses) {
      // Default: empty sessions stream to prevent ENOTFOUND
      vi.spyOn(client, 'sessions').mockImplementation(() => {
        return (async function* () {})() as any;
      });
    }

    // Mock session().activities.hydrate() for activity hydration
    const serverActivities =
      tc.given.serverActivities || tc.given.sessionActivities;
    const localActivities = tc.given.localActivities || {};

    // Create a mock that returns per-session activity counts
    // The hydrate() function should return NEW activities (server - local)
    const createMockSessionClient = (sessionId: string) => {
      // Extract just the session ID part (remove 'sessions/' prefix if present)
      const shortId = sessionId.replace(/^sessions\//, '');

      // Get server activities for this session
      const serverActs =
        serverActivities?.[shortId] || serverActivities?.[sessionId] || [];
      // Get local activities for this session
      const localActs =
        localActivities?.[shortId] || localActivities?.[sessionId] || [];

      // Calculate new activities (those not in local cache)
      const localIds = new Set(localActs.map((a: any) => a.id));
      const newActivities = (serverActs as any[]).filter(
        (a: any) => !localIds.has(a.id),
      );

      return {
        activities: {
          hydrate: vi.fn(async () => {
            // Return count of NEW activities (not already in local cache)
            return newActivities.length;
          }),
        },
        history: vi.fn(async function* () {
          // Legacy - kept for any tests that still use history()
          const sorted = [...(serverActs as any[])].sort(
            (a, b) =>
              new Date((b as any).createTime || 0).getTime() -
              new Date((a as any).createTime || 0).getTime(),
          );
          for (const act of sorted) {
            yield act;
          }
        }),
      };
    };

    // Track hydrate call counts for verification
    const hydrateCallCounts = { total: 0 };

    vi.spyOn(client, 'session').mockImplementation((sessionId: string) => {
      const mockClient = createMockSessionClient(sessionId);
      // Wrap hydrate to track total calls
      const originalHydrate = mockClient.activities.hydrate;
      mockClient.activities.hydrate = vi.fn(async () => {
        hydrateCallCounts.total++;
        return originalHydrate();
      });
      return mockClient as any;
    });

    // Mock checkpoint loading
    if (tc.given.checkpoint) {
      vi.spyOn(client as any, 'loadCheckpoint').mockResolvedValue(
        tc.given.checkpoint,
      );
    }
    vi.spyOn(client as any, 'saveCheckpoint').mockResolvedValue(undefined);
    vi.spyOn(client as any, 'clearCheckpoint').mockResolvedValue(undefined);

    // Handle syncInProgress test case
    if (tc.given.syncInProgress) {
      // Manually set the lock to simulate an in-progress sync
      (client as any).syncInProgress = true;
    }

    // Execute sync
    const options = tc.given.options || {};

    let abortController: AbortController | undefined;
    if (tc.given.abortAfterSessions) {
      abortController = new AbortController();
      const originalSessions = client.sessions;
      let sessionCount = 0;

      vi.spyOn(client, 'sessions').mockImplementation((opts) => {
        const cursor = originalSessions.call(client, opts);
        return {
          [Symbol.asyncIterator]: async function* () {
            for await (const session of cursor) {
              sessionCount++;
              if (sessionCount > tc.given.abortAfterSessions!) {
                abortController!.abort();
              }
              yield session;
            }
          },
        } as any;
      });

      options.signal = abortController.signal;
    }

    if (tc.then.throws) {
      if (tc.then.throws.error === 'SyncInProgressError') {
        await expect(client.sync(options as any)).rejects.toThrow(
          SyncInProgressError,
        );
      } else {
        await expect(client.sync(options as any)).rejects.toThrow(
          tc.then.throws.error,
        );
      }
    } else {
      const stats = await client.sync(options as any);

      // Verify stats
      if (tc.then.stats) {
        if (tc.then.stats.sessionsIngested !== undefined) {
          expect(stats.sessionsIngested).toBe(tc.then.stats.sessionsIngested);
        }
        if (tc.then.stats.activitiesIngested !== undefined) {
          expect(stats.activitiesIngested).toBe(
            tc.then.stats.activitiesIngested,
          );
        }
        if (tc.then.stats.isComplete !== undefined) {
          expect(stats.isComplete).toBe(tc.then.stats.isComplete);
        }
      }

      // Verify call counts
      if (tc.then.calls) {
        for (const call of tc.then.calls) {
          switch (call.method) {
            case 'storage.upsert':
              expect(mockStorage.upsert).toHaveBeenCalledTimes(call.times);
              break;
            case 'sessionClient.history':
              // Legacy: now we use activities.hydrate() instead
              // Each session gets its own mock, so we track total calls separately
              expect(hydrateCallCounts.total).toBe(call.times);
              break;
          }
        }
      }

      // Verify startedFromSession
      if (tc.then.startedFromSession) {
        // Check the first session that was actually processed
        expect(mockStorage.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ id: tc.then.startedFromSession }),
        );
      }
    }
  };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('Sync Specification Tests', () => {
  const allCases = loadTestCases();

  // Group by category
  const categories = new Map<string, TestCase[]>();
  for (const tc of allCases) {
    if (!categories.has(tc.category)) {
      categories.set(tc.category, []);
    }
    categories.get(tc.category)!.push(tc);
  }

  // Generate tests by category
  for (const [category, cases] of categories) {
    describe(category, () => {
      for (const tc of cases) {
        const testFn = tc.status === 'pending' ? it.skip : it;
        testFn(`[${tc.id}] ${tc.description}`, executeTest(tc));
      }
    });
  }
});

// =============================================================================
// Statistics
// =============================================================================

describe('Spec Coverage', () => {
  it('reports test case statistics', () => {
    const cases = loadTestCases();

    const stats = {
      total: cases.length,
      implemented: cases.filter((c) => c.status === 'implemented').length,
      pending: cases.filter((c) => c.status === 'pending').length,
      skipped: cases.filter((c) => c.status === 'skipped').length,
      p0: cases.filter((c) => c.priority === 'P0').length,
      p1: cases.filter((c) => c.priority === 'P1').length,
      p2: cases.filter((c) => c.priority === 'P2').length,
    };

    console.log('\n📊 Spec Test Statistics:');
    console.log(`   Total:       ${stats.total}`);
    console.log(`   Implemented: ${stats.implemented}`);
    console.log(`   Pending:     ${stats.pending}`);
    console.log(`   Skipped:     ${stats.skipped}`);
    console.log(`\n   P0 (Critical): ${stats.p0}`);
    console.log(`   P1 (Important): ${stats.p1}`);
    console.log(`   P2 (Nice-to-have): ${stats.p2}`);

    // Pass - this is just for reporting
    expect(true).toBe(true);
  });
});
