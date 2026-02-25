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
import { SessionCursor, ListSessionsResponse } from '../src/sessions.js';
import { ApiClient } from '../src/api.js';
import {
  SessionResource,
  SessionOutcome,
  RestSessionResource,
} from '../src/types.js';
import { JulesClientImpl } from '../src/client.js';
import { NodePlatform } from '../src/platform/node.js';
import { SessionStorage } from '../src/storage/types.js';

const createMockOutcome = (sessionId: string): SessionOutcome => ({
  sessionId,
  title: 'test',
  state: 'completed',
  outputs: [],
  generatedFiles: () => ({
    all: () => [],
    get: () => undefined,
    filter: () => [],
  }),
  changeSet: () => undefined,
});

describe('jules.sessions()', () => {
  let apiClient: ApiClient;
  let client: JulesClientImpl;
  let mockStorageFactory: any;
  let mockSessionStorage: SessionStorage;

  beforeEach(() => {
    // Mock the ApiClient request method
    apiClient = {
      request: vi.fn(),
    } as unknown as ApiClient;

    // Mock Session Storage
    mockSessionStorage = {
      init: vi.fn(),
      upsert: vi.fn(),
      upsertMany: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      scanIndex: vi.fn(),
    } as unknown as SessionStorage;

    // Mock storage factory
    mockStorageFactory = {
      activity: vi.fn(),
      session: vi.fn().mockReturnValue(mockSessionStorage),
    };

    // Create a client with mocked dependencies
    client = new JulesClientImpl(
      { apiKey: 'test-key' },
      mockStorageFactory,
      new NodePlatform(),
    );

    // Inject the mocked apiClient into the client
    (client as any).apiClient = apiClient;
  });

  const createRestSession = (id: string): RestSessionResource => ({
    id,
    name: `sessions/${id}`,
    prompt: 'test',
    sourceContext: { source: 'test' },
    source: {
      name: 'sources/github/test/repo',
      id: 'github/test/repo',
      githubRepo: { owner: 'test', repo: 'repo', isPrivate: false },
    },
    title: 'test',
    createTime: '2023-01-01T00:00:00Z',
    updateTime: '2023-01-01T00:00:00Z',
    state: 'COMPLETED',
    url: 'test',
    outputs: [],
  });

  it('should return a SessionCursor', () => {
    const cursor = client.sessions();
    expect(cursor).toBeInstanceOf(SessionCursor);
  });

  it('should fetch the first page when awaited', async () => {
    const mockResponse = {
      sessions: [createRestSession('1'), createRestSession('2')],
      nextPageToken: 'token-1',
    };
    (apiClient.request as any).mockResolvedValue(mockResponse);

    const result = await client.sessions({ pageSize: 10 });

    expect(apiClient.request).toHaveBeenCalledWith('sessions', {
      query: { pageSize: '10' },
    });
    expect(result.nextPageToken).toBe(mockResponse.nextPageToken);
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0].state).toBe('completed');
    // We check upsertMany with mapped sessions (any)
    expect(mockSessionStorage.upsertMany).toHaveBeenCalled();
  });

  it('should iterate over all sessions across multiple pages using async iterator', async () => {
    const page1 = {
      sessions: [createRestSession('1'), createRestSession('2')],
      nextPageToken: 'token-1',
    };
    const page2 = {
      sessions: [createRestSession('3')],
      nextPageToken: undefined,
    };

    (apiClient.request as any)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const results: SessionResource[] = [];

    for await (const session of client.sessions()) {
      results.push(session);
    }

    expect(results).toHaveLength(3);
    expect(results.map((s) => s.id)).toEqual(['1', '2', '3']);
    expect(apiClient.request).toHaveBeenCalledTimes(2);
    expect(mockSessionStorage.upsertMany).toHaveBeenCalledTimes(2);
  });

  it('should stop iterating when limit is reached within a page', async () => {
    const page1 = {
      sessions: [
        createRestSession('1'),
        createRestSession('2'),
        createRestSession('3'),
      ],
      nextPageToken: 'token-1',
    };

    (apiClient.request as any).mockResolvedValue(page1);

    const results: SessionResource[] = [];

    for await (const session of client.sessions({ limit: 2 })) {
      results.push(session);
    }

    expect(results).toHaveLength(2);
    expect(results.map((s) => s.id)).toEqual(['1', '2']);
    expect(apiClient.request).toHaveBeenCalledTimes(1);
    expect(mockSessionStorage.upsertMany).toHaveBeenCalledTimes(1);
  });

  // NEW: Test for cross-page limiting
  it('should stop iterating when limit is reached across pages', async () => {
    const page1 = {
      sessions: [createRestSession('1'), createRestSession('2')],
      nextPageToken: 'token-1',
    };
    const page2 = {
      sessions: [createRestSession('3'), createRestSession('4')],
      nextPageToken: 'token-2', // Even if there's more, we should stop
    };

    (apiClient.request as any)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const results: SessionResource[] = [];

    // Limit is 3, page size implies 2 (based on data returned)
    for await (const session of client.sessions({ limit: 3 })) {
      results.push(session);
    }

    expect(results).toHaveLength(3);
    expect(results.map((s) => s.id)).toEqual(['1', '2', '3']);
    expect(apiClient.request).toHaveBeenCalledTimes(2);
    expect(mockSessionStorage.upsertMany).toHaveBeenCalledTimes(2);
  });

  // NEW: Test for manual pagination
  it('should support manual pagination via pageToken', async () => {
    const page1Response = {
      sessions: [createRestSession('1')],
      nextPageToken: 'token-1',
    };
    const page2Response = {
      sessions: [createRestSession('2')],
      nextPageToken: undefined,
    };

    (apiClient.request as any)
      .mockResolvedValueOnce(page1Response)
      .mockResolvedValueOnce(page2Response);

    // Step 1: Get first page
    const page1 = await client.sessions({ pageSize: 1 });
    expect(page1.sessions).toHaveLength(1);
    expect(page1.nextPageToken).toBe('token-1');

    // Step 2: Get second page using token from first
    const page2 = await client.sessions({
      pageSize: 1,
      pageToken: page1.nextPageToken,
    });
    expect(page2.sessions).toHaveLength(1);
    expect(page2.sessions[0].id).toBe('2');

    expect(apiClient.request).toHaveBeenCalledTimes(2);
    expect(apiClient.request).toHaveBeenNthCalledWith(2, 'sessions', {
      query: { pageSize: '1', pageToken: 'token-1' },
    });
  });

  // NEW: Verify Write-Through cache interaction
  it('should trigger storage upsert on fetch', async () => {
    const mockSessions = [createRestSession('1')];
    (apiClient.request as any).mockResolvedValue({ sessions: mockSessions });

    await client.sessions();

    expect(mockStorageFactory.session).toHaveBeenCalled();
    expect(mockSessionStorage.upsertMany).toHaveBeenCalled();
  });

  // NEW: Test for filter option
  it('should pass filter parameter to API', async () => {
    const mockSessions = [createRestSession('1')];
    (apiClient.request as any).mockResolvedValue({ sessions: mockSessions });

    await client.sessions({ filter: 'archived = true' });

    expect(apiClient.request).toHaveBeenCalledWith('sessions', {
      query: { filter: 'archived = true' },
    });
  });
});
