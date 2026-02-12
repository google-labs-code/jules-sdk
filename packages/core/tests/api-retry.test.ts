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

import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { server } from './mocks/server.js';
import { http, HttpResponse } from 'msw';
import { ApiClient } from '../src/api.js';

// Set up the mock server
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

const API_KEY = 'test-api-key';
const BASE_URL = 'https://jules.googleapis.com/v1alpha';

describe('ApiClient Retry Logic', () => {
  const apiClient = new ApiClient({
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    requestTimeoutMs: 1000,
    rateLimitRetry: {
      maxRetryTimeMs: 5000,
      baseDelayMs: 100,
      maxDelayMs: 1000,
    },
  });

  // Use fake timers to control retries
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('should retry on 503 error', async () => {
    let callCount = 0;
    server.use(
      http.get(`${BASE_URL}/test`, () => {
        callCount++;
        if (callCount < 3) {
          return new HttpResponse(null, {
            status: 503,
            statusText: 'Service Unavailable',
          });
        }
        return HttpResponse.json({ success: true });
      }),
    );

    const promise = apiClient.request('test');

    // Advance timers to trigger retries
    // We need to advance enough time for the delays + jitter
    // Base delays: 100, 200
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(callCount).toBe(3);
  });

  it('should retry on 500, 502, 504 errors', async () => {
    const codes = [500, 502, 504];
    for (const code of codes) {
      let callCount = 0;
      server.use(
        http.get(`${BASE_URL}/test-${code}`, () => {
          callCount++;
          if (callCount < 2) {
            return new HttpResponse(null, { status: code });
          }
          return HttpResponse.json({ success: true });
        }),
      );

      const promise = apiClient.request(`test-${code}`);
      await vi.advanceTimersByTimeAsync(500);
      await expect(promise).resolves.toEqual({ success: true });
      expect(callCount).toBe(2);
    }
  });

  it('should apply jitter to backoff', async () => {
    let callCount = 0;
    // Mock Date.now to allow controlled stepping
    vi.setSystemTime(new Date(0));
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5); // Fixed jitter

    server.use(
      http.get(`${BASE_URL}/jitter`, () => {
        callCount++;
        return new HttpResponse(null, { status: 503 });
      }),
    );

    const promise = apiClient.request('jitter');

    // Expected logic:
    // Retry 0:
    // base = 100 * 2^0 = 100
    // jitter = 0.5 * (100 * 0.1) = 0.5 * 10 = 5
    // delay = 105
    // Retry 1:
    // base = 100 * 2^1 = 200
    // jitter = 5
    // delay = 205

    // Advance by 110ms - should trigger 1st retry (delay 105)
    await vi.advanceTimersByTimeAsync(110);
    expect(callCount).toBe(2);

    // Now waiting for 2nd retry (delay 205ms). Scheduled at t=105.
    // Target fire time: 105 + 205 = 310.
    // Current time: 110.
    // Remaining wait: 200.

    // Advance by 195ms -> t = 110 + 195 = 305.
    // 305 < 310. Should NOT fire.
    await vi.advanceTimersByTimeAsync(195);
    expect(callCount).toBe(2);

    // Advance by 10ms -> t = 305 + 10 = 315.
    // 315 > 310. Should fire.
    await vi.advanceTimersByTimeAsync(10);
    expect(callCount).toBe(3);

    // Clean up promise rejection
    server.resetHandlers();
    server.use(
      http.get(`${BASE_URL}/jitter`, () => {
        return HttpResponse.json({ success: true });
      }),
    );
    // Let the pending retry succeed
    await vi.advanceTimersByTimeAsync(1000);
    try {
      await promise;
    } catch {}
  });
});
