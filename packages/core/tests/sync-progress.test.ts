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
import { JulesClientImpl } from '../src/client.js';
import { mockPlatform } from './mocks/platform.js';

describe('JulesClient.sync Progress', () => {
  let jules: JulesClientImpl;
  let mockStorage: any;
  let mockApiClient: any;

  beforeEach(() => {
    // Mock Session Storage
    const mockSessionStorage = {
      scanIndex: async function* () {
        yield { createTime: '2023-01-01T00:00:00Z' };
      },
      upsert: vi.fn(),
      get: vi.fn(),
    };

    // Mock Activity Storage
    const mockActivityStorage = {
      scan: async function* () {},
      upsert: vi.fn(),
      init: vi.fn(),
      latest: vi.fn(),
      append: vi.fn(),
    };

    mockStorage = {
      session: () => mockSessionStorage,
      activity: () => mockActivityStorage,
    };

    // Mock ApiClient inside JulesClient
    // We can't easily mock private properties, so we'll mock the module or intercept requests?
    // Easier to stub `sessions` and `session` methods on the instance.
    jules = new JulesClientImpl({ apiKey: 'test' }, mockStorage, mockPlatform);
  });

  it('should report detailed progress during activity hydration', async () => {
    // Mock sessions() to return one session
    const mockSession = {
      id: 'session-123',
      createTime: '2024-01-01T00:00:00Z',
    };
    jules.sessions = vi.fn().mockReturnValue(
      (async function* () {
        yield mockSession;
      })(),
    );

    // Mock session() to return a client with activities.hydrate()
    const mockSessionClient = {
      activities: {
        hydrate: vi.fn().mockResolvedValue(3), // Simulate 3 activities hydrated
      },
      history: vi.fn().mockReturnValue(
        (async function* () {
          yield { id: 'act-1' };
          yield { id: 'act-2' };
          yield { id: 'act-3' };
        })(),
      ),
    };
    jules.session = vi.fn().mockReturnValue(mockSessionClient as any);

    const onProgress = vi.fn();

    await jules.sync({
      depth: 'activities',
      incremental: false, // Force fetch
      onProgress,
    });

    // Check progress calls
    // 1. Initial
    expect(onProgress).toHaveBeenCalledWith({
      phase: 'fetching_list',
      current: 0,
    });

    // 2. Fetching list done for 1 session
    expect(onProgress).toHaveBeenCalledWith({
      phase: 'fetching_list',
      current: 1,
      lastIngestedId: 'session-123',
    });

    // 3. Start hydrating
    expect(onProgress).toHaveBeenCalledWith({
      phase: 'hydrating_records',
      current: 0,
      total: 1,
    });

    // 4. Done hydrating (now uses activities.hydrate() which reports total count at end)
    expect(onProgress).toHaveBeenCalledWith({
      phase: 'hydrating_records',
      current: 1,
      total: 1,
      lastIngestedId: 'session-123',
      activityCount: 3, // Reported by hydrate()
    });
  });
});
