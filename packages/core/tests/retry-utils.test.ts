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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withFirstRequestRetry } from '../src/retry-utils.js';
import { JulesApiError } from '../src/errors.js';

describe('withFirstRequestRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return the result on success without retry', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const resultPromise = withFirstRequestRetry(fn);
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on 404 and succeed on second attempt', async () => {
    const fn = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new JulesApiError('http://test', 404, 'Not Found');
      })
      .mockResolvedValueOnce('success after retry');

    const resultPromise = withFirstRequestRetry(fn);

    // Advance past the 1s retry delay
    await vi.advanceTimersByTimeAsync(1001);

    const result = await resultPromise;
    expect(result).toBe('success after retry');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry multiple times with exponential backoff', async () => {
    const fn = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new JulesApiError('http://test', 404, 'Not Found');
      })
      .mockImplementationOnce(async () => {
        throw new JulesApiError('http://test', 404, 'Not Found');
      })
      .mockImplementationOnce(async () => {
        throw new JulesApiError('http://test', 404, 'Not Found');
      })
      .mockResolvedValueOnce('success after 3 retries');

    const resultPromise = withFirstRequestRetry(fn);

    // Advance past all delays: 1s + 2s + 4s = 7s total
    await vi.advanceTimersByTimeAsync(8000);

    const result = await resultPromise;
    expect(result).toBe('success after 3 retries');
    expect(fn).toHaveBeenCalledTimes(4); // Initial + 3 retries
  });

  it('should throw after exhausting all retries', async () => {
    const fn = vi.fn().mockImplementation(async () => {
      throw new JulesApiError('http://test', 404, 'Not Found');
    });

    const resultPromise = withFirstRequestRetry(fn);
    // Attach the expectation before advancing timers to avoid unhandled rejection
    const expectPromise = expect(resultPromise).rejects.toThrow(JulesApiError);

    // Advance past all delays: 1s + 2s + 4s + 8s + 16s = 31s
    await vi.advanceTimersByTimeAsync(32000);

    await expectPromise;
    expect(fn).toHaveBeenCalledTimes(6); // Initial + 5 retries
  });

  it('should throw immediately on non-404 errors', async () => {
    const fn = vi.fn().mockImplementation(async () => {
      throw new JulesApiError('http://test', 500, 'Server Error');
    });

    await expect(withFirstRequestRetry(fn)).rejects.toThrow(JulesApiError);

    // Only 1 call, no retries
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw non-404 error during retry immediately', async () => {
    const fn = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new JulesApiError('http://test', 404, 'Not Found');
      })
      .mockImplementationOnce(async () => {
        throw new JulesApiError('http://test', 500, 'Server Error');
      });

    const resultPromise = withFirstRequestRetry(fn);
    const expectPromise = expect(resultPromise).rejects.toThrow(JulesApiError);

    // Advance past the first retry delay
    await vi.advanceTimersByTimeAsync(1001);

    await expectPromise;

    // 2 calls: initial 404, then 500 (stopped retrying)
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should support custom retry options', async () => {
    const fn = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new JulesApiError('http://test', 404, 'Not Found');
      })
      .mockImplementationOnce(async () => {
        throw new JulesApiError('http://test', 404, 'Not Found');
      });

    // Only allow 1 retry with 100ms initial delay
    const resultPromise = withFirstRequestRetry(fn, {
      maxRetries: 1,
      initialDelayMs: 100,
    });
    const expectPromise = expect(resultPromise).rejects.toThrow(JulesApiError);

    // Advance past both delays
    await vi.advanceTimersByTimeAsync(500);

    await expectPromise;

    // Initial + 1 retry = 2 calls
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
