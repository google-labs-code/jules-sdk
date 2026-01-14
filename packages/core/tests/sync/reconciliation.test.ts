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
import { SessionResource } from '../../src/types.js';
import { ApiClient } from '../../src/api.js';
import { SessionCursor } from '../../src/sessions.js';
import { SessionStorage } from '../../src/storage/types.js';

// Mock dependencies
vi.mock('../../src/api.js');
vi.mock('../../src/sessions.js');
vi.mock('../../src/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/client.js')>();
  return {
    ...actual,
    // Keep JulesClientImpl but mock parts of it if needed, or rely on mocking deps
  };
});

// Helper to create mock sessions
const createMockSession = (
  id: string,
  createTime: string,
): SessionResource => ({
  id,
  name: `sessions/${id}`,
  createTime,
  updateTime: createTime,
  state: 'completed',
  prompt: 'test',
  title: 'test',
  url: 'http://test.com',
  outputs: [],
  sourceContext: { source: 'github/owner/repo' },
  source: {
    name: 'sources/github/owner/repo',
    id: 'github/owner/repo',
    type: 'githubRepo',
    githubRepo: { owner: 'owner', repo: 'repo', isPrivate: false },
  },
});

describe('Reconciliation Engine', () => {
  let client: JulesClientImpl;
  let mockStorage: any;
  let mockApiClient: any;

  beforeEach(() => {
    // Mock Storage
    mockStorage = {
      scanIndex: vi.fn(),
      get: vi.fn(),
      upsert: vi.fn(),
      session: vi.fn(),
    };

    // Mock API Client
    mockApiClient = new ApiClient({
      apiKey: 'test',
      baseUrl: 'test',
      requestTimeoutMs: 1000,
    });

    // Mock Platform
    const mockPlatform = {
      getEnv: vi.fn(),
    };

    // Create Client
    client = new JulesClientImpl(
      {},
      {
        session: () => mockStorage,
        activity: vi.fn() as any,
      },
      mockPlatform as any,
    );

    // Inject mock API client (since it's private, we cast to any)
    (client as any).apiClient = mockApiClient;
  });

  it('Cold Start: Ingests all sessions when cache is empty', async () => {
    // Setup API to return 5 sessions
    const sessions = [
      createMockSession('1', '2023-01-01T00:00:00Z'),
      createMockSession('2', '2023-01-02T00:00:00Z'),
      createMockSession('3', '2023-01-03T00:00:00Z'),
      createMockSession('4', '2023-01-04T00:00:00Z'),
      createMockSession('5', '2023-01-05T00:00:00Z'),
    ];

    // Mock sessions() to return these
    vi.spyOn(client, 'sessions').mockImplementation(() => {
      return (async function* () {
        for (const s of sessions) yield s;
      })() as any;
    });

    // Mock empty storage
    mockStorage.scanIndex.mockImplementation(async function* () {});

    const stats = await client.sync({ depth: 'metadata' });

    expect(stats.sessionsIngested).toBe(5);
    expect(client.sessions).toHaveBeenCalled();
    expect(mockStorage.upsert).toHaveBeenCalledTimes(5);
  });

  it('Incremental Sync: Stops at High-Water Mark', async () => {
    // Local cache has session from Monday
    const monday = '2023-01-02T00:00:00Z';
    mockStorage.scanIndex.mockImplementation(async function* () {
      yield { createTime: monday };
    });

    // API returns Tuesday (new) then Monday (old)
    const tuesday = '2023-01-03T00:00:00Z';
    const sessions = [
      createMockSession('2', tuesday),
      createMockSession('1', monday),
    ];

    vi.spyOn(client, 'sessions').mockImplementation(() => {
      return (async function* () {
        for (const s of sessions) yield s;
      })() as any;
    });

    const stats = await client.sync({ depth: 'metadata', incremental: true });

    // Should ingest Tuesday, then see Monday <= HighWaterMark and stop
    expect(stats.sessionsIngested).toBe(1);
    expect(mockStorage.upsert).toHaveBeenCalledTimes(1);
    expect(mockStorage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: '2' }),
    );
  });

  it('Limit Enforcement: Respects the limit option', async () => {
    // Generate 100 sessions
    const sessions = Array.from({ length: 100 }, (_, i) =>
      createMockSession(`${i}`, new Date().toISOString()),
    );

    vi.spyOn(client, 'sessions').mockImplementation(() => {
      return (async function* () {
        for (const s of sessions) yield s;
      })() as any;
    });

    // Mock empty storage
    mockStorage.scanIndex.mockImplementation(async function* () {});

    const stats = await client.sync({ limit: 10, depth: 'metadata' });

    expect(stats.sessionsIngested).toBe(10);
    expect(mockStorage.upsert).toHaveBeenCalledTimes(10);
  });
});
