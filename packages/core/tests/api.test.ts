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
import { ApiClient } from '../src/api.js';

describe('ApiClient (Unit)', () => {
  const mockFetch = vi.fn();
  global.fetch = mockFetch as any;

  const proxyConfig = {
    url: 'https://proxy.com/api',
    auth: () => 'fake-auth-token',
  };

  beforeEach(() => {
    mockFetch.mockReset();
    // Default successful response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, token: 'mock-cap-token' }),
      text: async () => '',
    });
  });

  it('Handshake: sends "create" intent with session config', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.jules.com',
      requestTimeoutMs: 1000,
      apiKey: undefined,
      proxy: proxyConfig,
    });

    // Trigger a request that requires a "Create" handshake
    await client.request('sessions', {
      method: 'POST',
      handshake: {
        intent: 'create',
        sessionConfig: { prompt: 'New Session', source: 'github/repo' },
      },
    });

    // Verify the Handshake payload
    expect(mockFetch).toHaveBeenCalledWith(
      'https://proxy.com/api',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"intent":"create"'),
      }),
    );

    // Deep inspection of the body
    const handshakeCall = mockFetch.mock.calls.find(
      (call) => call[0] === 'https://proxy.com/api',
    );
    if (!handshakeCall) throw new Error('Handshake call not found');
    const body = JSON.parse(handshakeCall[1].body);

    expect(body).toMatchObject({
      authToken: 'fake-auth-token',
      intent: 'create',
      context: {
        prompt: 'New Session',
        source: 'github/repo',
      },
    });
  });

  it('Handshake: sends "resume" intent with session ID', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.jules.com',
      requestTimeoutMs: 1000,
      apiKey: undefined,
      proxy: proxyConfig,
    });

    // Trigger a request that requires a "Resume" handshake
    await client.request('sessions/sess_123', {
      method: 'GET',
      handshake: {
        intent: 'resume',
        sessionId: 'sess_123',
      },
    });

    const handshakeCall = mockFetch.mock.calls.find(
      (call) => call[0] === 'https://proxy.com/api',
    );
    if (!handshakeCall) throw new Error('Handshake call not found');
    const body = JSON.parse(handshakeCall[1].body);

    expect(body).toMatchObject({
      authToken: 'fake-auth-token',
      intent: 'resume',
      sessionId: 'sess_123',
    });
  });

  it('Handshake: defaults to "resume" if no context provided (Backward Compatibility)', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.jules.com',
      requestTimeoutMs: 1000,
      apiKey: undefined,
      proxy: proxyConfig,
    });

    // Legacy call style
    await client.request('sessions/old');

    const handshakeCall = mockFetch.mock.calls.find(
      (call) => call[0] === 'https://proxy.com/api',
    );
    if (!handshakeCall) throw new Error('Handshake call not found');
    const body = JSON.parse(handshakeCall[1].body);

    expect(body.intent).toBe('resume');
  });
});
