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
import { ApiClient } from '../src/api.js';
import { JulesRateLimitError } from '../src/errors.js';

describe('ApiClient 429 Retry Logic', () => {
  const baseUrl = 'https://api.jules.com';

  beforeEach(() => {
    vi.useFakeTimers();
    // Mock global fetch
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should retry once after 1s delay if 429 is returned once', async () => {
    const apiClient = new ApiClient({
      apiKey: 'test-key',
      baseUrl,
      requestTimeoutMs: 1000,
    });
    const fetchMock = global.fetch as any;

    fetchMock
      .mockResolvedValueOnce(
        new Response('Rate Limit', {
          status: 429,
          statusText: 'Too Many Requests',
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"success": true}', { status: 200 }),
      );

    const promise = apiClient.request('test');

    // 1. Initial request fails immediately.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 2. Advance time by 999ms. Retry should NOT happen yet.
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 3. Advance time by 1ms (Total 1000ms). Retry should happen.
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result).toEqual({ success: true });
  });

  it('should retry twice (1s, 2s) if 429 is returned twice', async () => {
    const apiClient = new ApiClient({
      apiKey: 'test-key',
      baseUrl,
      requestTimeoutMs: 1000,
    });
    const fetchMock = global.fetch as any;

    fetchMock
      .mockResolvedValueOnce(new Response('429', { status: 429 }))
      .mockResolvedValueOnce(new Response('429', { status: 429 }))
      .mockResolvedValueOnce(
        new Response('{"success": true}', { status: 200 }),
      );

    const promise = apiClient.request('test');

    // Attempt 1: Immediate
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Wait 1s (Backoff 1) -> Attempt 2
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Wait 2s (Backoff 2) -> Attempt 3
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await expect(promise).resolves.toEqual({ success: true });
  });

  it('should retry three times (1s, 2s, 4s) if 429 is returned three times', async () => {
    const apiClient = new ApiClient({
      apiKey: 'test-key',
      baseUrl,
      requestTimeoutMs: 1000,
    });
    const fetchMock = global.fetch as any;

    fetchMock
      .mockResolvedValueOnce(new Response('429', { status: 429 })) // 1
      .mockResolvedValueOnce(new Response('429', { status: 429 })) // 2
      .mockResolvedValueOnce(new Response('429', { status: 429 })) // 3
      .mockResolvedValueOnce(
        new Response('{"success": true}', { status: 200 }),
      ); // 4 (Success)

    const promise = apiClient.request('test');

    // Attempt 1: Immediate
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Wait 1s -> Attempt 2
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Wait 2s -> Attempt 3
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Wait 4s -> Attempt 4
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await expect(promise).resolves.toEqual({ success: true });
  });

  describe('Time-based retry (configurable maxRetryTimeMs)', () => {
    it('should FAIL after configured timeout (7s config, should fail after ~7s)', async () => {
      // Configure a short timeout for testing: 7s
      // With 1s base delay, exponential backoff: 1s, 2s, 4s = 7s total
      const apiClient = new ApiClient({
        apiKey: 'test-key',
        baseUrl,
        requestTimeoutMs: 1000,
        rateLimitRetry: {
          maxRetryTimeMs: 7000, // 7 seconds
          baseDelayMs: 1000,
          maxDelayMs: 30000,
        },
      });
      const fetchMock = global.fetch as any;

      // Always 429
      fetchMock.mockResolvedValue(
        new Response('429', { status: 429, statusText: 'Go Away' }),
      );

      const promise = apiClient.request('test');

      // Attach expectation early to prevent unhandled rejection warnings
      const failureExpectation =
        expect(promise).rejects.toThrow(JulesRateLimitError);

      // Attempt 1: Immediate (elapsed = 0)
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Wait 1s -> Attempt 2 (elapsed = 1s)
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Wait 2s -> Attempt 3 (elapsed = 3s)
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      // Wait 4s -> Attempt 4 (elapsed = 7s, which equals maxRetryTimeMs)
      // This should exceed the time limit and throw
      await vi.advanceTimersByTimeAsync(4000);
      expect(fetchMock).toHaveBeenCalledTimes(4);

      // No more retries should happen
      await vi.advanceTimersByTimeAsync(10000);
      expect(fetchMock).toHaveBeenCalledTimes(4);

      await failureExpectation;
    });

    it('should retry for 5 minutes by default', async () => {
      const apiClient = new ApiClient({
        apiKey: 'test-key',
        baseUrl,
        requestTimeoutMs: 1000,
        // Using defaults: maxRetryTimeMs = 300000 (5 min)
      });
      const fetchMock = global.fetch as any;

      // Fail for 4 minutes, then succeed
      let callCount = 0;
      fetchMock.mockImplementation(() => {
        callCount++;
        // After 4 minutes of retries (many calls), succeed
        if (callCount > 10) {
          return Promise.resolve(
            new Response('{"success": true}', { status: 200 }),
          );
        }
        return Promise.resolve(new Response('429', { status: 429 }));
      });

      const promise = apiClient.request('test');

      // Advance 4 minutes worth of time (240s)
      // Backoffs: 1s, 2s, 4s, 8s, 16s, 30s (capped), 30s, 30s, 30s, 30s, 30s...
      // After 11 calls minimum we succeed
      for (let i = 0; i < 15; i++) {
        await vi.advanceTimersByTimeAsync(30000);
      }

      await expect(promise).resolves.toEqual({ success: true });
    });

    it('should respect maxDelayMs cap', async () => {
      const apiClient = new ApiClient({
        apiKey: 'test-key',
        baseUrl,
        requestTimeoutMs: 1000,
        rateLimitRetry: {
          maxRetryTimeMs: 300000,
          baseDelayMs: 1000,
          maxDelayMs: 5000, // Cap at 5 seconds
        },
      });
      const fetchMock = global.fetch as any;

      // Always 429 at first, then success
      fetchMock
        .mockResolvedValueOnce(new Response('429', { status: 429 })) // 1
        .mockResolvedValueOnce(new Response('429', { status: 429 })) // 2
        .mockResolvedValueOnce(new Response('429', { status: 429 })) // 3
        .mockResolvedValueOnce(new Response('429', { status: 429 })) // 4 (delay would be 8s without cap)
        .mockResolvedValueOnce(
          new Response('{"success": true}', { status: 200 }),
        );

      const promise = apiClient.request('test');

      // Attempt 1
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 1s delay -> Attempt 2
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // 2s delay -> Attempt 3
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      // 4s delay -> Attempt 4
      await vi.advanceTimersByTimeAsync(4000);
      expect(fetchMock).toHaveBeenCalledTimes(4);

      // 5s delay (capped from 8s) -> Attempt 5
      // Check that 4.9s is not enough
      await vi.advanceTimersByTimeAsync(4900);
      expect(fetchMock).toHaveBeenCalledTimes(4);

      await vi.advanceTimersByTimeAsync(100);
      expect(fetchMock).toHaveBeenCalledTimes(5);

      await expect(promise).resolves.toEqual({ success: true });
    });

    it('should allow custom baseDelayMs', async () => {
      const apiClient = new ApiClient({
        apiKey: 'test-key',
        baseUrl,
        requestTimeoutMs: 1000,
        rateLimitRetry: {
          maxRetryTimeMs: 300000,
          baseDelayMs: 500, // 500ms base
          maxDelayMs: 30000,
        },
      });
      const fetchMock = global.fetch as any;

      fetchMock
        .mockResolvedValueOnce(new Response('429', { status: 429 }))
        .mockResolvedValueOnce(
          new Response('{"success": true}', { status: 200 }),
        );

      const promise = apiClient.request('test');

      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 499ms should not be enough
      await vi.advanceTimersByTimeAsync(499);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 1ms more (500ms total) triggers retry
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await expect(promise).resolves.toEqual({ success: true });
    });
  });
});
