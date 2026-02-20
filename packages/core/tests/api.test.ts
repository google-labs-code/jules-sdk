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
import { ApiClient } from '../src/api.js';
import { MissingApiKeyError } from '../src/errors.js';

describe('ApiClient (Unit)', () => {
  const mockFetch = vi.fn();
  global.fetch = mockFetch as any;

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('Direct Mode: sends API key in header', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
      text: async () => JSON.stringify({ success: true }),
    });

    const client = new ApiClient({
      baseUrl: 'https://api.jules.com',
      requestTimeoutMs: 1000,
      apiKey: 'test-api-key',
    });

    await client.request('test-endpoint');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.jules.com/test-endpoint',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Goog-Api-Key': 'test-api-key',
        }),
      }),
    );
  });

  it('Direct Mode: throws MissingApiKeyError if no API key provided', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.jules.com',
      requestTimeoutMs: 1000,
      apiKey: undefined,
    });

    await expect(client.request('test-endpoint')).rejects.toThrow(
      MissingApiKeyError,
    );
  });

  describe('Resilience & Concurrency', () => {
    it('Retries on 5xx errors (503 Service Unavailable)', async () => {
      // Mock fetch to return 503 twice, then 200
      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            text: async () => 'Service Unavailable',
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true }),
        };
      });

      const client = new ApiClient({
        baseUrl: 'https://api.jules.com',
        requestTimeoutMs: 1000,
        apiKey: 'test-api-key',
        rateLimitRetry: {
          baseDelayMs: 10,
          maxDelayMs: 20,
        },
      });

      const result = await client.request('test-endpoint');

      expect(callCount).toBe(3);
      expect(result).toEqual({ success: true });
    });

    it('Concurrency limiter restricts simultaneous requests', async () => {
      const client = new ApiClient({
        baseUrl: 'https://api.jules.com',
        requestTimeoutMs: 1000,
        apiKey: 'test-api-key',
        maxConcurrentRequests: 2,
      });

      mockFetch.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true }),
        };
      });

      const startTime = Date.now();
      await Promise.all([
        client.request('1'),
        client.request('2'),
        client.request('3'),
        client.request('4'),
        client.request('5'),
      ]);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // With concurrency 2 and 50ms delay:
      // Batch 1: req 1, 2 start. (0ms)
      // Batch 1 finishes at 50ms.
      // Batch 2: req 3, 4 start. (50ms)
      // Batch 2 finishes at 100ms.
      // Batch 3: req 5 starts. (100ms)
      // Batch 3 finishes at 150ms.
      // Total should be around 150ms.
      // If no limit (concurrency 5):
      // All start at 0ms, finish at 50ms.

      expect(duration).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThan(300); // giving some buffer
    });
  });
});
