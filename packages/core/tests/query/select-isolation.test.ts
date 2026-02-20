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
import { SessionResource, Activity, SessionOutcome } from '../../src/types.js';

const mockOutcome: SessionOutcome = {
  sessionId: 'isolation-spec-test',
  title: 'Test Session',
  state: 'completed',
  outputs: [],
  generatedFiles: () => ({
    all: () => [],
    get: () => undefined,
    filter: () => [],
  }),
  changeSet: () => undefined,
};

/**
 * This test verifies that select() with include: { activities: true }
 * does NOT trigger network requests - it only reads from local cache.
 *
 * Previously this was an integration test using jules.with() which was
 * flaky due to filesystem I/O. Now it uses mocked storage like other tests.
 */
describe('jules.select() Network Isolation Spec', () => {
  it('should NOT trigger network requests for activities during select', async () => {
    // 1. Setup mock session storage
    const sessionId = 'sessions/isolation-spec-test';
    const dummySession: SessionResource = {
      id: sessionId,
      name: sessionId,
      state: 'inProgress',
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString(),
      title: 'Test Session',
      sourceContext: { source: 'github/owner/repo' },
      source: {
        name: 'sources/github/owner/repo',
        id: 'github/owner/repo',
        type: 'githubRepo',
        githubRepo: { owner: 'owner', repo: 'repo', isPrivate: false },
      },
      outputs: [],
      url: 'http://test',
      prompt: 'test',
      outcome: mockOutcome,
    };

    // 2. Setup mock activity client that tracks calls
    const activitySelectSpy = vi.fn().mockResolvedValue([]);
    const networkFetchSpy = vi.fn();

    const mockClient = {
      storage: {
        scanIndex: async function* () {
          yield {
            id: sessionId,
            title: dummySession.title,
            state: dummySession.state,
          };
        },
        get: async (id: string) => {
          if (id === sessionId) {
            return { resource: dummySession };
          }
          return null;
        },
      },
      session: (id: string) => ({
        activities: {
          // This is the local cache select - should be called
          select: activitySelectSpy,
          // These would trigger network requests - should NOT be called
          list: networkFetchSpy,
          stream: networkFetchSpy,
          history: networkFetchSpy,
        },
        info: async () => dummySession,
        stream: async function* () {
          // This would be infinite polling - should NOT be called
          networkFetchSpy();
          yield* [];
        },
        history: async function* () {
          networkFetchSpy();
          yield* [];
        },
      }),
    };

    // 3. Execute select with include: activities
    const results = await select(mockClient as any, {
      from: 'sessions',
      select: ['id'],
      include: {
        activities: true,
      },
    });

    // 4. Assertions
    // Verify local select() was called (cache read)
    expect(activitySelectSpy).toHaveBeenCalled();

    // STRICTLY ZERO network fetches
    expect(networkFetchSpy).not.toHaveBeenCalled();

    // Verify we got the session back
    const found = results.find((s) => s.id === sessionId);
    expect(found).toBeDefined();

    // Activities should be an empty array (since cache is empty)
    expect(found?.activities).toEqual([]);
  });
});
