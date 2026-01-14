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
import { JulesClientImpl } from '../../src/client.js';
import {
  MemoryStorage,
  MemorySessionStorage,
} from '../../src/storage/memory.js';
import { ApiClient } from '../../src/api.js';
import { SessionResource } from '../../src/types.js';

vi.mock('../../src/api.js');

const mockPlatform = {
  getEnv: () => undefined,
};

const createClient = () => {
  return new JulesClientImpl(
    {
      apiKey: 'test-key',
      config: {
        requestTimeoutMs: 100,
      },
    },
    {
      activity: (sessionId: string) => new MemoryStorage(),
      session: () => new MemorySessionStorage(),
    },
    mockPlatform as any,
  );
};

describe('Sync Targeting (CTRL-07, CTRL-08)', () => {
  let jules: JulesClientImpl;
  let apiClient: ApiClient;

  beforeEach(() => {
    jules = createClient();
    apiClient = vi.mocked(ApiClient).mock.instances[0];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('CTRL-07: Targeted Sync', () => {
    it('should sync only the specified session', async () => {
      const targetSessionId = 'sess-b';
      const allSessions: SessionResource[] = [
        { id: 'sess-a', name: 'sessions/sess-a' } as SessionResource,
        { id: 'sess-b', name: 'sessions/sess-b' } as SessionResource,
        { id: 'sess-c', name: 'sessions/sess-c' } as SessionResource,
      ];

      vi.mocked(apiClient.request).mockImplementation(async (path) => {
        if (path.endsWith(targetSessionId)) {
          return allSessions.find((s) => s.id === targetSessionId);
        }
        return {};
      });

      await jules.sync({ sessionId: targetSessionId });

      expect(apiClient.request).toHaveBeenCalledWith(
        `sessions/${targetSessionId}`,
      );
      expect(apiClient.request).toHaveBeenCalledTimes(1);

      const cachedSessions = await jules.select({ from: 'sessions' });
      expect(cachedSessions).toHaveLength(1);
      expect(cachedSessions[0].id).toBe(targetSessionId);
    });
  });

  describe('CTRL-08: Global Sync', () => {
    it('should sync all sessions when no sessionId is provided', async () => {
      const allSessions: SessionResource[] = [
        {
          id: 'sess-a',
          name: 'sessions/sess-a',
          createTime: '2024-01-01T00:00:00Z',
        } as SessionResource,
        {
          id: 'sess-b',
          name: 'sessions/sess-b',
          createTime: '2024-01-02T00:00:00Z',
        } as SessionResource,
        {
          id: 'sess-c',
          name: 'sessions/sess-c',
          createTime: '2024-01-03T00:00:00Z',
        } as SessionResource,
      ];

      // Mock the session list endpoint
      vi.mocked(apiClient.request).mockResolvedValueOnce({
        sessions: allSessions,
        nextPageToken: null,
      });

      await jules.sync();

      // Should call the list endpoint, not individual sessions
      expect(apiClient.request).toHaveBeenCalledWith('sessions', {
        query: { pageSize: '100' },
      });
      expect(apiClient.request).toHaveBeenCalledTimes(1);

      const cachedSessions = await jules.select({ from: 'sessions' });
      expect(cachedSessions).toHaveLength(allSessions.length);
      expect(cachedSessions.map((s) => s.id)).toEqual(
        expect.arrayContaining(['sess-a', 'sess-b', 'sess-c']),
      );
    });
  });
});
