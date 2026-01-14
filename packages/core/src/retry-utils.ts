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

// src/retry-utils.ts

import { JulesApiError } from './errors.js';

// Helper for delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Configuration options for first-request retry logic.
 */
export interface FirstRequestRetryOptions {
  /**
   * Maximum number of retry attempts after the initial failure.
   * @default 5
   */
  maxRetries?: number;

  /**
   * Initial delay in milliseconds before the first retry.
   * Subsequent retries use exponential backoff (delay * 2^attempt).
   * @default 1000
   */
  initialDelayMs?: number;
}

/**
 * Default retry configuration.
 */
const DEFAULT_OPTIONS: Required<FirstRequestRetryOptions> = {
  maxRetries: 5,
  initialDelayMs: 1000,
};

/**
 * Wraps an async function with 404 retry logic for first requests.
 *
 * This handles eventual consistency issues when a session is newly created
 * but not yet available from the API. Only retries on 404 errors; other
 * errors are thrown immediately.
 *
 * @param fn - The async function to execute with retry protection.
 * @param options - Retry configuration options.
 * @returns The result of the function if successful.
 * @throws {JulesApiError} If all retries are exhausted or a non-404 error occurs.
 *
 * @example
 * ```typescript
 * const result = await withFirstRequestRetry(
 *   () => apiClient.request('sessions/123/activities'),
 *   { maxRetries: 5, initialDelayMs: 1000 }
 * );
 * ```
 */
export async function withFirstRequestRetry<T>(
  fn: () => Promise<T>,
  options?: FirstRequestRetryOptions,
): Promise<T> {
  const { maxRetries, initialDelayMs } = { ...DEFAULT_OPTIONS, ...options };

  try {
    return await fn();
  } catch (error) {
    // Only retry on 404 errors (eventual consistency)
    if (!(error instanceof JulesApiError && error.status === 404)) {
      throw error;
    }

    let lastError: JulesApiError = error;
    let delay = initialDelayMs;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      await sleep(delay);
      delay *= 2; // Exponential backoff

      try {
        return await fn();
      } catch (retryError) {
        if (retryError instanceof JulesApiError && retryError.status === 404) {
          lastError = retryError;
          // Continue retrying
        } else {
          throw retryError; // Non-404 error, throw immediately
        }
      }
    }

    throw lastError; // All retries exhausted
  }
}
