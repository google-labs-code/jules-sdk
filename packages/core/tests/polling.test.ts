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

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { pollSession, pollUntilCompletion } from '../src/polling.js';
import { ApiClient } from '../src/api.js';
import { SessionResource, SessionOutcome } from '../src/types.js';

const mockOutcome: SessionOutcome = {
  sessionId: 'test-session-id',
  title: 'test session',
  state: 'completed',
  outputs: [],
  generatedFiles: () => ({ all: () => [], get: () => undefined, filter: () => [] }),
  changeSet: () => undefined,
};

describe('polling helpers', () => {
  // We define the mock outside to be reused, but we must reset it.
  const mockApiClient = {
    request: vi.fn(),
  } as unknown as ApiClient;

  const sessionId = 'test-session-id';
  const pollingInterval = 100;

  const baseSession: SessionResource = {
    id: sessionId,
    name: `sessions/${sessionId}`,
    state: 'completed',
    prompt: 'test prompt',
    sourceContext: { source: 'test-source' },
    source: {
      name: 'sources/github/test/repo',
      id: 'github/test/repo',
      type: 'githubRepo',
      githubRepo: { owner: 'test', repo: 'repo', isPrivate: false },
    },
    title: 'test session',
    url: 'http://test.url',
    outputs: [],
    outcome: mockOutcome,
    createTime: '2023-01-01T00:00:00Z',
    updateTime: '2023-01-01T00:01:00Z',
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('pollSession', () => {
    it('should return immediately if predicate is met on first try', async () => {
      const session: SessionResource = {
        ...baseSession,
        state: 'completed',
      };

      vi.mocked(mockApiClient.request).mockResolvedValueOnce(session);

      const result = await pollSession(
        sessionId,
        mockApiClient,
        (s) => s.state === 'completed',
        pollingInterval,
      );

      expect(result).toEqual(session);
      expect(mockApiClient.request).toHaveBeenCalledTimes(1);
      expect(mockApiClient.request).toHaveBeenCalledWith(
        `sessions/${sessionId}`,
      );
    });

    it('should poll until predicate is met', async () => {
      vi.useFakeTimers();

      const runningSession: SessionResource = {
        ...baseSession,
        state: 'inProgress',
        updateTime: '2023-01-01T00:00:00Z',
      };

      const completedSession: SessionResource = {
        ...baseSession,
        state: 'completed',
        updateTime: '2023-01-01T00:01:00Z',
      };

      vi.mocked(mockApiClient.request)
        .mockResolvedValueOnce(runningSession)
        .mockResolvedValueOnce(runningSession)
        .mockResolvedValueOnce(completedSession);

      const promise = pollSession(
        sessionId,
        mockApiClient,
        (s) => s.state === 'completed',
        pollingInterval,
      );

      // Use advanceTimersByTimeAsync instead of runAllTimersAsync to have precise control
      await vi.advanceTimersByTimeAsync(pollingInterval);
      await vi.advanceTimersByTimeAsync(pollingInterval);

      const result = await promise;

      expect(result).toEqual(completedSession);
      expect(mockApiClient.request).toHaveBeenCalledTimes(3);
    });
  });

  describe('pollUntilCompletion', () => {
    it('should resolve when state is completed', async () => {
      const completedSession: SessionResource = {
        ...baseSession,
        state: 'completed',
      };

      vi.mocked(mockApiClient.request).mockResolvedValueOnce(completedSession);

      const result = await pollUntilCompletion(
        sessionId,
        mockApiClient,
        pollingInterval,
      );

      expect(result).toEqual(completedSession);
    });

    it('should resolve when state is failed', async () => {
      const failedSession: SessionResource = {
        ...baseSession,
        state: 'failed',
      };

      vi.mocked(mockApiClient.request).mockResolvedValueOnce(failedSession);

      const result = await pollUntilCompletion(
        sessionId,
        mockApiClient,
        pollingInterval,
      );

      expect(result).toEqual(failedSession);
    });

    it('should continue polling when state is running', async () => {
      vi.useFakeTimers();

      const runningSession: SessionResource = {
        ...baseSession,
        state: 'inProgress',
        updateTime: '2023-01-01T00:00:00Z',
      };

      const completedSession: SessionResource = {
        ...baseSession,
        state: 'completed',
        updateTime: '2023-01-01T00:01:00Z',
      };

      vi.mocked(mockApiClient.request)
        .mockResolvedValueOnce(runningSession)
        .mockResolvedValueOnce(completedSession);

      const promise = pollUntilCompletion(
        sessionId,
        mockApiClient,
        pollingInterval,
      );

      await vi.advanceTimersByTimeAsync(pollingInterval);

      const result = await promise;

      expect(result).toEqual(completedSession);
      expect(mockApiClient.request).toHaveBeenCalledTimes(2);
    });
  });
});
