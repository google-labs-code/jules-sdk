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

import { ProxyConfig } from './types.js';
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
  proxy?: ProxyConfig;
  rateLimitRetry?: Partial<RateLimitRetryConfig>;
};

export type HandshakeContext =
  | { intent: 'create'; sessionConfig: any }
  | { intent: 'resume'; sessionId: string };

export type ApiRequestOptions = {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  query?: Record<string, any>;
  headers?: Record<string, string>;
  handshake?: HandshakeContext;
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
  private readonly proxy?: ProxyConfig;
  private readonly rateLimitConfig: RateLimitRetryConfig;
  private capabilityToken: string | null = null;
  // Cache the handshake promise to prevent parallel handshakes (thundering herd)
  private handshakePromise: Promise<string> | null = null;

  constructor(options: ApiClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.proxy = options.proxy;
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
      handshake,
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
    } else if (this.proxy) {
      // Proxy Mode
      const token = await this.ensureToken(handshake);
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      throw new MissingApiKeyError();
    }

    // 2. Execute Request
    const response = await this.fetchWithTimeout(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // 3. Auto-Retry on 401/403 (Token Expiration)
    if (this.proxy && (response.status === 401 || response.status === 403)) {
      if (_isRetry) {
        throw new JulesAuthenticationError(
          url.toString(),
          response.status,
          'Authentication failed even after token refresh',
        );
      }

      // Force a fresh handshake
      this.capabilityToken = null;
      // Recursive call with retry flag
      return this.request<T>(endpoint, { ...options, _isRetry: true });
    }

    if (!response.ok) {
      if (response.status === 429) {
        // Time-based retry: Keep retrying until maxRetryTimeMs is exhausted
        const startTime = (options as any)._rateLimitStartTime || Date.now();
        const elapsed = Date.now() - startTime;
        const retryCount = (options as any)._rateLimitRetryCount || 0;

        if (elapsed < this.rateLimitConfig.maxRetryTimeMs) {
          // Exponential backoff capped at maxDelayMs
          const rawDelay =
            this.rateLimitConfig.baseDelayMs * Math.pow(2, retryCount);
          const delay = Math.min(rawDelay, this.rateLimitConfig.maxDelayMs);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.request<T>(endpoint, {
            ...options,
            _rateLimitStartTime: startTime,
            _rateLimitRetryCount: retryCount + 1,
          } as any);
        }

        throw new JulesRateLimitError(
          url.toString(),
          response.status,
          response.statusText,
        );
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

  /**
   * Ensures we have a valid Capability Token.
   * If not, performs the Handshake.
   */
  private async ensureToken(context?: HandshakeContext): Promise<string> {
    // If we are explicitly asking to create a session, we must ensure the token
    // carries the 'create' intent. Existing cached tokens might be 'resume' tokens
    // or generic ones, which might not be authorized for creation.
    // Therefore, we invalidate the cache for 'create' intent to force a fresh handshake.
    if (context?.intent === 'create') {
      this.capabilityToken = null;
    }

    if (this.capabilityToken) return this.capabilityToken;
    if (!this.proxy) throw new Error('Missing Proxy Configuration');

    // Deduplicate concurrent handshake requests
    if (!this.handshakePromise) {
      this.handshakePromise = this.performHandshake(context);
    }

    try {
      this.capabilityToken = await this.handshakePromise;
      return this.capabilityToken;
    } finally {
      this.handshakePromise = null;
    }
  }

  private async performHandshake(context?: HandshakeContext): Promise<string> {
    if (!this.proxy) throw new Error('No proxy config');

    // 1. Get Identity Token (e.g. Firebase)
    const authToken = this.proxy.auth ? await this.proxy.auth() : '';

    // 2. Construct the Body based on Context
    const body: any = { authToken };

    if (context?.intent === 'create') {
      body.intent = 'create';
      body.context = context.sessionConfig; // Pass prompt/source
    } else {
      // Default to resume if unspecified, or explicitly resume
      body.intent = 'resume';
      if (context?.intent === 'resume') {
        body.sessionId = context.sessionId;
      }
    }

    // 3. Call Proxy Handshake Endpoint
    const res = await this.fetchWithTimeout(this.proxy.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data: any = await res.json();
    if (!data.success) throw new Error(data.error || 'Handshake failed');
    return data.token;
  }

  private resolveUrl(path: string): URL {
    if (this.proxy) {
      // When using Proxy, the path is appended to the proxy URL
      const url = new URL(this.proxy.url);
      url.searchParams.append('path', `/${path}`);
      return url;
    }
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
