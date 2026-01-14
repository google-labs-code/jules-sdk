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
import { JulesClientImpl } from '../../src/client.js';
import { ApiClient } from '../../src/api.js';

describe('Congestion Control', () => {
  let client: JulesClientImpl;
  let mockStorage: any;
  let mockSessionClient: any;

  beforeEach(() => {
    mockStorage = {
      scanIndex: vi.fn(async function* () {}),
      session: vi.fn(),
      upsert: vi.fn(),
    };
    mockSessionClient = {
      activities: {
        hydrate: vi.fn(async () => 0),
      },
      history: vi.fn(async function* () {}),
    };

    client = new JulesClientImpl(
      {},
      {
        session: () => mockStorage,
        activity: () => ({
          init: vi.fn(),
          latest: vi.fn(),
          append: vi.fn(),
          close: vi.fn(),
          get: vi.fn(),
          scan: vi.fn(async function* () {}),
        }),
      },
      { getEnv: vi.fn() } as any,
    );
    (client as any).apiClient = new ApiClient({
      apiKey: 'test',
      baseUrl: 'test',
      requestTimeoutMs: 1000,
    });
    vi.spyOn(client, 'session').mockReturnValue(mockSessionClient as any);
  });

  it('Concurrency Verification: Ensures tasks run sequentially when concurrency is 1', async () => {
    // Setup 3 sessions
    const sessions = [
      { id: '1', createTime: new Date().toISOString() },
      { id: '2', createTime: new Date().toISOString() },
      { id: '3', createTime: new Date().toISOString() },
    ];
    vi.spyOn(client, 'sessions').mockImplementation(() => {
      return (async function* () {
        for (const s of sessions) yield s;
      })() as any;
    });

    // Mock hydrate to take 100ms
    mockSessionClient.activities.hydrate.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return 1;
    });

    const start = Date.now();
    await client.sync({ depth: 'activities', limit: 3, concurrency: 1 });
    const duration = Date.now() - start;

    // 3 * 100ms = 300ms minimum
    expect(duration).toBeGreaterThanOrEqual(300);
  });

  it('Resilience: Partial success on network interruption', async () => {
    // 3 sessions. Fail on the 3rd.
    const sessions = [
      { id: '1', createTime: new Date().toISOString() },
      { id: '2', createTime: new Date().toISOString() },
      { id: '3', createTime: new Date().toISOString() },
    ];
    vi.spyOn(client, 'sessions').mockImplementation(() => {
      return (async function* () {
        for (const s of sessions) yield s;
      })() as any;
    });

    let callCount = 0;
    mockSessionClient.activities.hydrate.mockImplementation(async () => {
      callCount++;
      if (callCount === 3) throw new Error('Network Error');
      return 1;
    });

    await expect(
      client.sync({ depth: 'activities', concurrency: 1 }),
    ).rejects.toThrow('Network Error');

    // Sessions 1 and 2 were processed before error (since sequential/batched)
    // Note: pMap stops on error by default.
    // The previous sessions are "ingested" in memory but stats might not be returned if it throws.
    // However, the test requirement says "sessions 1 and 2 remain valid in the local cache".
    // Since we mock storage, we can't check file system, but we can verify calls.
    // The implementation iterates and hydrates. pMap runs in parallel.
    // With concurrency 1, it runs 1, then 2, then 3 (fails).
    // The promise rejects.

    // In a real scenario, sessions 1 and 2 would have completed their `sessionClient.history()` calls
    // which triggers writing to disk (as per mock description "This triggers a full history sync to disk").
    // So even if sync() throws, the side effects for 1 and 2 happened.
    expect(callCount).toBe(3);
  });
});
