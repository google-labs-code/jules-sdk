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
import { select } from '../../src/query/select.js';
import {
  JulesClient,
  JulesQuery,
  SessionResource,
  Activity,
  ActivityAgentMessaged,
  SessionOutcome,
} from '../../src/types.js';

const createMockOutcome = (
  sessionId: string,
  title: string,
): SessionOutcome => ({
  sessionId,
  title,
  state: 'completed',
  outputs: [],
  generatedFiles: () => ({
    all: () => [],
    get: () => undefined,
    filter: () => [],
  }),
  changeSet: () => undefined,
});

// Mock types
type MockSessionStorage = {
  scanIndex: () => AsyncIterableIterator<{
    id: string;
    title: string;
    state: string;
  }>;
  get: (id: string) => Promise<{ resource: SessionResource } | null>;
};

type MockActivityClient = {
  select: (options: any) => Promise<Activity[]>;
};

type MockSessionClient = {
  activities: MockActivityClient;
  info: () => Promise<SessionResource>;
  history: () => AsyncIterable<Activity>;
  stream: () => AsyncIterable<Activity>;
};

type MockJulesClient = {
  storage: MockSessionStorage;
  session: (id: string) => MockSessionClient;
};

describe('Unified Query Engine (select)', () => {
  let mockClient: MockJulesClient;
  let sessions: SessionResource[];
  let activities: Record<string, Activity[]>;
  let sessionClients: Record<string, MockSessionClient>;

  beforeEach(() => {
    // 1. Setup Data
    const mockSource = {
      name: 'sources/github/owner/repo',
      id: 'github/owner/repo',
      type: 'githubRepo' as const,
      githubRepo: { owner: 'owner', repo: 'repo', isPrivate: false },
    };
    sessions = [
      {
        id: 'sess_1',
        name: 'sessions/sess_1',
        title: 'Fix Login',
        state: 'completed',
        prompt: 'Fix it',
        createTime: '2023-01-01T00:00:00Z',
        updateTime: '2023-01-01T01:00:00Z',
        url: 'http://jules/sess_1',
        outputs: [],
        sourceContext: { source: 'github/owner/repo' },
        source: mockSource,
        outcome: createMockOutcome('sess_1', 'Fix Login'),
      },
      {
        id: 'sess_2',
        name: 'sessions/sess_2',
        title: 'Add Feature X',
        state: 'failed',
        prompt: 'Add X',
        createTime: '2023-01-02T00:00:00Z',
        updateTime: '2023-01-02T01:00:00Z',
        url: 'http://jules/sess_2',
        outputs: [],
        sourceContext: { source: 'github/owner/repo' },
        source: mockSource,
        outcome: createMockOutcome('sess_2', 'Add Feature X'),
      },
    ];

    activities = {
      sess_1: [
        {
          id: 'act_1_1',
          name: 'sessions/sess_1/activities/act_1_1',
          type: 'agentMessaged',
          message: 'Hello',
          createTime: '2023-01-01T00:00:01Z',
          originator: 'agent',
          artifacts: [
            {
              type: 'bashOutput',
              command: 'ls',
              stdout: 'file1.txt',
              stderr: '',
              exitCode: 0,
              toString: () => '',
            },
          ],
        } as ActivityAgentMessaged,
      ],
      sess_2: [
        {
          id: 'act_2_1',
          name: 'sessions/sess_2/activities/act_2_1',
          type: 'sessionFailed',
          reason: 'Error',
          createTime: '2023-01-02T00:00:01Z',
          originator: 'system',
          artifacts: [],
        } as any,
      ],
    };

    sessionClients = {};

    // 2. Setup Mocks
    mockClient = {
      storage: {
        scanIndex: async function* () {
          for (const s of sessions) {
            yield { id: s.id, title: s.title, state: s.state };
          }
        },
        get: async (id: string) => {
          const found = sessions.find((s) => s.id === id);
          return found ? { resource: found } : null;
        },
      },
      session: (id: string) => {
        if (!sessionClients[id]) {
          sessionClients[id] = {
            activities: {
              select: async (options: any) => {
                // Simple mock filtering
                const acts = activities[id] || [];
                if (options.limit) return acts.slice(0, options.limit);
                if (options.type)
                  return acts.filter((a) => a.type === options.type);
                return acts;
              },
            },
            history: async function* () {
              const acts = activities[id] || [];
              for (const act of acts) {
                yield act;
              }
            },
            stream: async function* () {
              // Infinite stream simulation (should not be called)
            },
            info: async () => sessions.find((s) => s.id === id)!,
          };
        }
        return sessionClients[id];
      },
    };
  });

  describe('Querying Sessions', () => {
    it('should project specific fields', async () => {
      const results = await select(mockClient as any, {
        from: 'sessions',
        select: ['id', 'title'],
      });

      expect(results).toHaveLength(2);

      // Test projection for both, regardless of order
      const sess1 = results.find((s) => s.id === 'sess_1');
      const sess2 = results.find((s) => s.id === 'sess_2');

      expect(sess1).toBeDefined();
      expect(sess2).toBeDefined();

      expect(Object.keys(sess1!)).toEqual(['id', 'title']);
      expect((sess1! as any).state).toBeUndefined();

      expect(Object.keys(sess2!)).toEqual(['id', 'title']);
      expect((sess2! as any).state).toBeUndefined();
    });

    it('should use a default projection for lightweight fields (SHAPE-02)', async () => {
      const results = await select(mockClient as any, {
        from: 'sessions',
      });
      const sess1 = results.find((s) => s.id === 'sess_1');
      expect(sess1).toBeDefined();
      expect(Object.keys(sess1!).sort()).toEqual([
        'createTime',
        'id',
        'state',
        'title',
      ]);
      expect((sess1! as any).outcome).toBeUndefined();
    });

    it('should filter by state (index optimization)', async () => {
      const results = await select(mockClient as any, {
        from: 'sessions',
        where: { state: 'failed' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('sess_2');
    });

    it('should filter by search (fuzzy)', async () => {
      const results = await select(mockClient as any, {
        from: 'sessions',
        where: { search: 'login' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Fix Login');
    });

    it('should join activities', async () => {
      const results = await select(mockClient as any, {
        from: 'sessions',
        where: { id: 'sess_1' },
        include: {
          activities: true,
        },
      });

      expect(results).toHaveLength(1);
      const session = results[0] as any;
      expect(session.activities).toBeDefined();
      expect(session.activities).toHaveLength(1);
      expect(session.activities[0].message).toBe('Hello');
    });

    it('should use finite local select() instead of infinite stream() to prevent hanging', async () => {
      const sessionClient = mockClient.session('sess_1');
      const selectSpy = vi.spyOn(sessionClient.activities, 'select');
      const streamSpy = vi.spyOn(sessionClient, 'stream');

      await select(mockClient as any, {
        from: 'sessions',
        include: { activities: true },
      });

      // CRITICAL: select({}) returns finite local data
      expect(selectSpy).toHaveBeenCalled();
      // CRITICAL: stream() is an infinite poll; using it here is a bug
      expect(streamSpy).not.toHaveBeenCalled();
    });

    it('should properly augment session DTOs with activity data', async () => {
      const results = await select(mockClient as any, {
        from: 'sessions',
        include: { activities: true },
      });

      // The test is about augmentation, not order. Find the specific session.
      const session = results.find((s) => s.id === 'sess_1');
      expect(session).toBeDefined();

      // Verify the property exists and contains the expected data
      expect(session).toHaveProperty('activities');
      expect(Array.isArray((session as any).activities)).toBe(true);
      if ((session as any).activities.length > 0) {
        expect((session as any).activities[0].id).toBe('act_1_1');
      }
    });
  });

  describe('Querying Activities (Scatter-Gather)', () => {
    it('should use a default projection for lightweight fields (SHAPE-01)', async () => {
      const results = await select(mockClient as any, {
        from: 'activities',
      });
      const act1 = results.find((a) => a.id === 'act_1_1');
      expect(act1).toBeDefined();
      // Default projection now includes computed fields: artifactCount, summary
      expect(Object.keys(act1!).sort()).toEqual([
        'artifactCount',
        'createTime',
        'id',
        'originator',
        'summary',
        'type',
      ]);
      expect((act1! as any).artifacts).toBeUndefined();
    });

    it('should return all fields for an empty select array (SHAPE-05)', async () => {
      const results = await select(mockClient as any, {
        from: 'activities',
        select: [],
      });
      const act1 = results.find((a) => a.id === 'act_1_1');
      expect(act1).toBeDefined();
      expect(Object.keys(act1!).length).toBeGreaterThan(4);
      expect((act1! as any).artifacts).toBeDefined();
    });

    it('should find activities across all sessions', async () => {
      const results = await select(mockClient as any, {
        from: 'activities',
      });

      // Should find act_1_1 and act_2_1
      expect(results).toHaveLength(2);
    });

    it('should filter activities by type', async () => {
      const results = await select(mockClient as any, {
        from: 'activities',
        where: { type: 'sessionFailed' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('act_2_1');
    });

    it('should join parent session metadata', async () => {
      const results = await select(mockClient as any, {
        from: 'activities',
        where: { type: 'agentMessaged' },
        include: {
          session: { select: ['title'] },
        },
      });

      expect(results).toHaveLength(1);
      const act = results[0] as any;
      expect(act.session).toBeDefined();
      expect(act.session.title).toBe('Fix Login');
      expect(act.session.id).toBeUndefined(); // Projection check
    });

    it('should respect global limits', async () => {
      // Create 3 sessions with 1 activity each
      // ... (requires updating mock data, but simple limit check on existing data)
      const results = await select(mockClient as any, {
        from: 'activities',
        limit: 1,
      });

      expect(results).toHaveLength(1);
    });

    it('should cache session.info() calls during activity scatter-gather', async () => {
      // Setup: Two activities in the SAME session
      activities['sess_1'] = [
        {
          id: 'act_1_1',
          createTime: '2023-01-01T00:00:01Z',
          type: 'agentMessaged',
          originator: 'agent',
          artifacts: [],
        } as any,
        {
          id: 'act_1_2',
          createTime: '2023-01-01T00:00:02Z',
          type: 'agentMessaged',
          originator: 'agent',
          artifacts: [],
        } as any,
      ];

      const sessionClient = mockClient.session('sess_1');
      const infoSpy = vi.spyOn(sessionClient, 'info');

      await select(mockClient as any, {
        from: 'activities',
        include: { session: true },
      });

      // Without caching, info() would be called 2 times (once per activity).
      // With caching, it should be called exactly 1 time.
      expect(infoSpy).toHaveBeenCalledTimes(1);
    });
  });
});
