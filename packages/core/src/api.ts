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

// src/api.ts

import {
  JulesApiError,
  JulesAuthenticationError,
  JulesNetworkError,
  JulesRateLimitError,
  MissingApiKeyError,
} from './errors.js';

export type RateLimitRetryConfig = {
  maxRetryTimeMs: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export type ApiClientOptions = {
  apiKey: string | undefined;
  baseUrl: string;
  requestTimeoutMs: number;
  rateLimitRetry?: Partial<RateLimitRetryConfig>;
};

export type ApiRequestOptions = {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  query?: Record<string, any>;
  headers?: Record<string, string>;
  _isRetry?: boolean; // Internal flag to prevent infinite loops
  _rateLimitStartTime?: number; // Internal: Time when rate limit retries started
  _rateLimitRetryCount?: number; // Internal: Number of rate limit retries attempted
};

/**
 * A simple internal API client to handle HTTP requests to the Jules API.
 * @internal
 */
export class ApiClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly rateLimitConfig: RateLimitRetryConfig;

  constructor(options: ApiClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.requestTimeoutMs = options.requestTimeoutMs;

    // Detect if running in a test environment (Vitest) to prevent long retries in tests
    // that don't override the configuration.
    const isTest =
      typeof process !== 'undefined' && process.env?.VITEST === 'true';
    const defaultMaxRetryTimeMs = isTest ? 50 : 300000; // 50ms for tests, 5 minutes for prod

    this.rateLimitConfig = {
      maxRetryTimeMs:
        options.rateLimitRetry?.maxRetryTimeMs ?? defaultMaxRetryTimeMs,
      baseDelayMs: options.rateLimitRetry?.baseDelayMs ?? 1000,
      maxDelayMs: options.rateLimitRetry?.maxDelayMs ?? 30000,
    };
  }

  async request<T>(
    endpoint: string,
    options: ApiRequestOptions = {},
  ): Promise<T> {
    const {
      method = 'GET',
      body,
      query,
      headers: customHeaders,
      _isRetry,
    } = options;
    const url = this.resolveUrl(endpoint);

    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    // 1. Inject Credentials
    if (this.apiKey) {
      // Direct Mode
      headers['X-Goog-Api-Key'] = this.apiKey;
    } else {
      throw new MissingApiKeyError();
    }

    // 2. Execute Request
    const response = await this.fetchWithTimeout(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      if (
        response.status === 429 ||
        [500, 502, 503, 504].includes(response.status)
      ) {
        // Time-based retry: Keep retrying until maxRetryTimeMs is exhausted
        const startTime = options._rateLimitStartTime || Date.now();
        const elapsed = Date.now() - startTime;
        const retryCount = options._rateLimitRetryCount || 0;

        if (elapsed < this.rateLimitConfig.maxRetryTimeMs) {
          // Exponential backoff with Full Jitter
          const rawDelay =
            this.rateLimitConfig.baseDelayMs * Math.pow(2, retryCount);
          const cappedDelay = Math.min(
            rawDelay,
            this.rateLimitConfig.maxDelayMs,
          );
          // Randomize between 0 and cappedDelay
          const delay = Math.floor(Math.random() * cappedDelay);
          const finalDelay = Math.max(1, delay);

          await new Promise((resolve) => setTimeout(resolve, finalDelay));
          return this.request<T>(endpoint, {
            ...options,
            _rateLimitStartTime: startTime,
            _rateLimitRetryCount: retryCount + 1,
          });
        }

        if (response.status === 429) {
          throw new JulesRateLimitError(
            url.toString(),
            response.status,
            response.statusText,
          );
        }
        // Fall through to default error handling for 5xx if retries exhausted
      }

      switch (response.status) {
        case 401:
        case 403:
          throw new JulesAuthenticationError(
            url.toString(),
            response.status,
            response.statusText,
          );
        default:
          const errorBody = await response
            .text()
            .catch(() => 'Could not read error body');
          const message = `[${
            response.status
          } ${response.statusText}] ${method} ${url.toString()} - ${errorBody}`;
          throw new JulesApiError(
            url.toString(),
            response.status,
            response.statusText,
            message,
          );
      }
    }

    const responseText = await response.text();
    if (!responseText) {
      return {} as T;
    }

    return JSON.parse(responseText) as T;
  }

  private resolveUrl(path: string): URL {
    // Direct Mode
    return new URL(`${this.baseUrl}/${path}`);
  }

  private async fetchWithTimeout(url: string, opts: any): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    );

    try {
      const response = await fetch(url, {
        ...opts,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      throw new JulesNetworkError(url, {
        cause: error as Error,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
