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
    this.rateLimitConfig = {
      maxRetryTimeMs: options.rateLimitRetry?.maxRetryTimeMs ?? 300000, // 5 minutes
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

    const startTime = Date.now();
    let retryCount = 0;

    // Loop for retries
    while (true) {
      // 2. Execute Request
      const response = await this.fetchWithTimeout(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        const responseText = await response.text();
        if (!responseText) {
          return {} as T;
        }
        return JSON.parse(responseText) as T;
      }

      // Check if retryable
      const isRateLimit = response.status === 429;
      const isServerError =
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;

      if (isRateLimit || isServerError) {
        const elapsed = Date.now() - startTime;
        if (elapsed < this.rateLimitConfig.maxRetryTimeMs) {
          // Calculate delay with exponential backoff and jitter
          // baseDelay * 2^retryCount
          const exponentialDelay =
            this.rateLimitConfig.baseDelayMs * Math.pow(2, retryCount);

          // Jitter: +/- 10%
          // We use a simple random factor to avoid thundering herd
          const jitter = exponentialDelay * 0.1 * (Math.random() * 2 - 1);
          let delay = exponentialDelay + jitter;

          // Ensure delay is at least 0
          if (delay < 0) delay = 0;

          // Cap at maxDelayMs
          delay = Math.min(delay, this.rateLimitConfig.maxDelayMs);

          await new Promise((resolve) => setTimeout(resolve, delay));
          retryCount++;
          continue;
        }

        if (isRateLimit) {
           throw new JulesRateLimitError(
            url.toString(),
            response.status,
            response.statusText,
          );
        }
        // Fall through for server errors if timeout exceeded
      }

      // Handle non-retryable errors or exhausted retries
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
