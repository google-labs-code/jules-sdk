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
import { SessionClientImpl } from '../../src/session.js';

/**
 * Tests to ensure session.info() always populates outcome correctly,
 * regardless of whether data comes from cache or network.
 *
 * This prevents regressions of the bug where cached sessions had undefined outcome,
 * causing changeSet() to return undefined and MCP tools to report "0 files changed".
 */
describe('session.info() outcome mapping', () => {
  let mockApiClient: any;
  let mockSessionStorage: any;
  let mockActivityStorage: any;
  let mockPlatform: any;
  let mockConfig: any;

  const createMockSession = (id: string, outputs: any[] = []) => ({
    name: `sessions/${id}`,
    id,
    state: 'COMPLETED',
    createTime: '2026-01-01T00:00:00Z',
    updateTime: '2026-01-01T01:00:00Z',
    prompt: 'Test prompt',
    title: 'Test session',
    url: `https://jules.google.com/session/${id}`,
    outputs,
  });

  beforeEach(() => {
    mockApiClient = {
      request: vi.fn(),
    };

    mockSessionStorage = {
      get: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    };

    mockActivityStorage = {
      getAll: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      getLastSyncTime: vi.fn().mockResolvedValue(null),
      setLastSyncTime: vi.fn(),
    };

    mockPlatform = {
      mapArtifact: vi.fn((a: any) => a),
    };

    mockConfig = {
      pollingIntervalMs: 1000,
    };
  });

  it('populates outcome when fetched from network (cache miss)', async () => {
    const sessionData = createMockSession('123', [
      {
        changeSet: {
          source: 'test-source',
          gitPatch: {
            unidiffPatch: 'diff --git a/test.ts b/test.ts\n+new line',
            baseCommitId: 'abc123',
          },
        },
      },
    ]);

    // Cache miss
    mockSessionStorage.get.mockResolvedValue(null);
    mockApiClient.request.mockResolvedValue(sessionData);

    const session = new SessionClientImpl(
      '123',
      mockApiClient,
      mockConfig,
      mockActivityStorage,
      mockSessionStorage,
      mockPlatform,
    );

    const info = await session.info();

    expect(info.outcome).toBeDefined();
    expect(typeof info.outcome!.changeSet).toBe('function');
    expect(typeof info.outcome!.generatedFiles).toBe('function');
  });

  it('populates outcome when returned from cache (cache hit)', async () => {
    const sessionData = createMockSession('456', [
      {
        changeSet: {
          source: 'test-source',
          gitPatch: {
            unidiffPatch: 'diff --git a/test.ts b/test.ts\n+cached line',
            baseCommitId: 'def456',
          },
        },
      },
    ]);

    // Cache hit - return valid cached data
    mockSessionStorage.get.mockResolvedValue({
      resource: sessionData,
      fetchedAt: Date.now(), // Fresh cache
    });

    const session = new SessionClientImpl(
      '456',
      mockApiClient,
      mockConfig,
      mockActivityStorage,
      mockSessionStorage,
      mockPlatform,
    );

    const info = await session.info();

    // Should NOT have called the network
    expect(mockApiClient.request).not.toHaveBeenCalled();

    // But outcome should still be populated
    expect(info.outcome).toBeDefined();
    expect(typeof info.outcome!.changeSet).toBe('function');
    expect(typeof info.outcome!.generatedFiles).toBe('function');
  });

  it('changeSet() returns artifact when outputs contain changeSet', async () => {
    const sessionData = createMockSession('789', [
      {
        changeSet: {
          source: 'test-source',
          gitPatch: {
            unidiffPatch: 'diff --git a/file.ts b/file.ts\n+added',
            baseCommitId: 'ghi789',
          },
        },
      },
    ]);

    mockSessionStorage.get.mockResolvedValue({
      resource: sessionData,
      fetchedAt: Date.now(),
    });

    const session = new SessionClientImpl(
      '789',
      mockApiClient,
      mockConfig,
      mockActivityStorage,
      mockSessionStorage,
      mockPlatform,
    );

    const info = await session.info();
    const changeSet = info.outcome!.changeSet();

    expect(changeSet).toBeDefined();
    // The changeSet is a ChangeSetArtifact with gitPatch data
    expect(changeSet!.gitPatch).toBeDefined();
    expect(changeSet!.gitPatch.unidiffPatch).toContain('+added');
  });

  it('changeSet() returns undefined when outputs have no changeSet', async () => {
    const sessionData = createMockSession('empty', [
      {
        pullRequest: {
          url: 'https://github.com/test/pr/1',
          title: 'Test PR',
        },
      },
    ]);

    mockSessionStorage.get.mockResolvedValue({
      resource: sessionData,
      fetchedAt: Date.now(),
    });

    const session = new SessionClientImpl(
      'empty',
      mockApiClient,
      mockConfig,
      mockActivityStorage,
      mockSessionStorage,
      mockPlatform,
    );

    const info = await session.info();
    const changeSet = info.outcome!.changeSet();

    expect(changeSet).toBeUndefined();
  });
});
