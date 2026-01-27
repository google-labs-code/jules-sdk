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
});
