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

// src/errors.ts

/**
 * Base class for all SDK-specific errors.
 * This allows consumers to catch all Jules SDK errors with a single `catch` block.
 */
export class JulesError extends Error {
  /** The original error that caused this error, if any. */
  public readonly cause?: Error;

  constructor(message: string, options?: { cause?: Error }) {
    super(message);
    this.name = this.constructor.name;
    this.cause = options?.cause;
  }
}

/**
 * Thrown for fundamental network issues like fetch failures or timeouts.
 */
export class JulesNetworkError extends JulesError {
  public readonly url: string;
  constructor(url: string, options?: { cause?: Error }) {
    super(`Network request to ${url} failed`, options);
    this.url = url;
  }
}

/**
 * A generic wrapper for non-2xx API responses that don't match other specific errors.
 */
export class JulesApiError extends JulesError {
  public readonly url: string;
  public readonly status: number;
  public readonly statusText: string;

  constructor(
    url: string,
    status: number,
    statusText: string,
    message?: string, // optional override
    options?: { cause?: Error },
  ) {
    const finalMessage =
      message ?? `[${status} ${statusText}] Request to ${url} failed`;
    super(finalMessage, options);
    this.url = url;
    this.status = status;
    this.statusText = statusText;
  }
}

/**
 * Thrown for 401 Unauthorized or 403 Forbidden API responses.
 */
export class JulesAuthenticationError extends JulesApiError {
  constructor(url: string, status: number, statusText: string) {
    super(
      url,
      status,
      statusText,
      `[${status} ${statusText}] Authentication to ${url} failed. Ensure your API key is correct.`,
    );
  }
}

/**
 * Thrown for 429 Too Many Requests API responses.
 */
export class JulesRateLimitError extends JulesApiError {
  constructor(url: string, status: number, statusText: string) {
    super(
      url,
      status,
      statusText,
      `[${status} ${statusText}] API rate limit exceeded for ${url}.`,
    );
  }
}

/**
 * Thrown when an API key is required but not provided.
 */
export class MissingApiKeyError extends JulesError {
  constructor() {
    super(
      'Jules API key is missing. Pass it to the constructor or set the JULES_API_KEY environment variable.',
    );
  }
}

/**
 * Thrown when a requested source cannot be found.
 */
export class SourceNotFoundError extends JulesError {
  constructor(sourceIdentifier: string) {
    super(`Could not get source '${sourceIdentifier}'`);
  }
}

/**
 * Thrown when a jules.run() operation terminates in a FAILED state.
 */
export class AutomatedSessionFailedError extends JulesError {
  constructor(reason?: string) {
    let message = 'The Jules automated session terminated with a FAILED state.';
    if (reason) {
      message += ` Reason: ${reason}`;
    }
    super(message);
  }
}

/**
 * Thrown when attempting to start a sync while another sync is already in progress.
 * This prevents data corruption and thundering herd issues.
 */
export class SyncInProgressError extends JulesError {
  constructor() {
    super(
      'A sync operation is already in progress. Wait for it to complete before starting another.',
    );
  }
}

/**
 * Thrown when an operation is attempted on a session that is not in a
 * valid state for that operation.
 */
export class InvalidStateError extends JulesError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Thrown when an operation times out.
 */
export class TimeoutError extends JulesError {
  constructor(message: string) {
    super(message);
  }
}
