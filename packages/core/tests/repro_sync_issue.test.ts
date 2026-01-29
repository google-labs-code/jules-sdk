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
import { ApiClient } from '../src/api.js';
import { mockPlatform } from './mocks/platform.js';
import { SessionResource, SessionOutcome } from '../src/types.js';
import { NodeSessionStorage } from '../src/storage/node-fs.js';
import { SessionCursor } from '../src/sessions.js';

const createMockOutcome = (sessionId: string, title: string): SessionOutcome => ({
  sessionId,
  title,
  state: 'completed',
  outputs: [],
  generatedFiles: () => ({ all: () => [], get: () => undefined, filter: () => [] }),
  changeSet: () => undefined,
});

// Mock dependencies
vi.mock('../src/api.js');
vi.mock('../src/storage/node-fs.js');
vi.mock('../src/sessions.js');

describe('JulesClient.sync() Repro', () => {
  let client: JulesClientImpl;
  let mockApiClient: any;
  let mockSessionStorage: any;
  let mockActivityStorage: any;
  let mockStorageFactory: any;
  let mockCursor: any;

  const mockSource = {
    name: 'sources/github/test/repo',
    id: 'github/test/repo',
    type: 'githubRepo' as const,
    githubRepo: { owner: 'test', repo: 'repo', isPrivate: false },
  };

  const session1: SessionResource = {
    id: 'session-1',
    name: 'sessions/session-1',
    createTime: '2023-01-01T12:00:00Z',
    updateTime: '2023-01-01T12:00:00Z',
    state: 'inProgress',
    prompt: 'test',
    title: 'test session 1',
    sourceContext: { source: 'test' },
    source: mockSource,
    url: 'http://test.com',
    outputs: [],
    outcome: createMockOutcome('session-1', 'test session 1'),
  };

  const session2: SessionResource = {
    id: 'session-2',
    name: 'sessions/session-2',
    createTime: '2023-01-02T12:00:00Z', // Newer
    updateTime: '2023-01-02T12:00:00Z',
    state: 'inProgress',
    prompt: 'test',
    title: 'test session 2',
    sourceContext: { source: 'test' },
    source: mockSource,
    url: 'http://test.com',
    outputs: [],
    outcome: createMockOutcome('session-2', 'test session 2'),
  };

  beforeEach(() => {
    mockApiClient = {
      request: vi.fn(),
    };

    mockSessionStorage = {
      upsert: vi.fn(),
      scanIndex: vi.fn(async function* () {
        // Simulating that we already have session2 (the newest one)
        yield session2;
      }),
      get: vi.fn(),
    };

    mockActivityStorage = {
      scan: vi.fn(async function* () {}),
      upsert: vi.fn(),
      init: vi.fn(),
      latest: vi.fn(),
      append: vi.fn(),
    };

    mockStorageFactory = {
      session: () => mockSessionStorage,
      activity: () => mockActivityStorage,
    };

    // Mock SessionCursor to yield session2 then session1 (newest first from API)
    mockCursor = (async function* () {
      yield session2;
      yield session1;
    })();

    // Spy on sessions() to return our mock cursor
    // We need to cast client to any or access prototype if we want to spy before instantiation?
    // Or we can mock the method after instantiation.
  });

  it('hydrates activities for first cached session hit (incremental=true)', async () => {
    // This test verifies that when depth='activities' and incremental=true,
    // we still hydrate activities for the FIRST session that matches the high-water mark,
    // but we don't iterate through ALL older sessions (which would cause hanging).

    client = new JulesClientImpl(
      { apiKey: 'test-key' },
      mockStorageFactory,
      mockPlatform,
    );

    // Inject mock API client
    (client as any).apiClient = mockApiClient;

    // Mock sessions() method
    vi.spyOn(client, 'sessions').mockReturnValue(mockCursor as any);

    // Mock session() method to return a dummy session client for hydration
    const mockSessionClient = {
      activities: {
        hydrate: vi.fn().mockResolvedValue(1), // Simulate 1 activity hydrated
      },
      history: vi.fn().mockReturnValue(
        (async function* () {
          yield { id: 'act-1', type: 'agentMessaged' };
        })(),
      ),
    };
    vi.spyOn(client, 'session').mockReturnValue(mockSessionClient as any);

    // Act
    const result = await client.sync({
      depth: 'activities',
      incremental: true,
      limit: 10,
    });

    console.log('Sync result:', result);

    // Assert
    expect(result.sessionsIngested).toBe(0); // No new sessions were ingested
    expect(result.activitiesIngested).toBe(1); // Activities from session2 were hydrated
    // We upsert session2 (the first cached session hit) for hydration
    expect(mockSessionStorage.upsert).toHaveBeenCalledWith(session2);
    // We do NOT upsert session1 - we stop iterating at the high-water mark
    expect(mockSessionStorage.upsert).not.toHaveBeenCalledWith(session1);
  });
});
