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

// tests/init.test.ts
import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest';
import { server } from './mocks/server.js';
import { jules as defaultJules } from '../src/index.js';
import { JulesClientImpl } from '../src/client.js';
import { MissingApiKeyError } from '../src/errors.js';

// Set up the mock server before all tests and clean up after
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('SDK Initialization', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original process.env after each test
    process.env = originalEnv;
  });

  it('should prioritize apiKey from options over environment variable', () => {
    process.env.JULES_API_KEY = 'env-var-key';
    // Use .with() for configuration
    const jules = defaultJules.with({
      apiKey: 'option-key',
    }) as JulesClientImpl;
    // @ts-expect-error apiClient is private, but we access it for this test
    expect(jules.apiClient['apiKey']).toBe('option-key');
  });

  it('should read apiKey from JULES_API_KEY environment variable if not in options', () => {
    process.env.JULES_API_KEY = 'env-var-key';
    // We must use .with({}) to force a new instance that re-reads the env var,
    // because the default singleton reads it at module load time.
    const jules = defaultJules.with({}) as JulesClientImpl;
    // @ts-expect-error apiClient is private, but we access it for this test
    expect(jules.apiClient['apiKey']).toBe('env-var-key');
  });

  it('should throw MissingApiKeyError if no apiKey is provided', async () => {
    delete process.env.JULES_API_KEY;
    // Re-create default instance to pick up deleted env var
    // Since 'jules' is a const, we need to simulate a fresh start or use a factory for this specific test case if we can't re-init the const.
    // Actually, the const is initialized at module load time.
    // If we need to test *runtime* missing key, we might need to use `.with({})` to force re-evaluation if it happens there,
    // OR we might need to rely on the deprecated factory for this specific test if we can't easily re-initialize the singleton's internal state.
    // LET'S CHECK client.ts: apiKey is read in constructor.
    // SO: `defaultJules` has already read it.
    // We MUST use `.with()` or the deprecated factory to test this scenario if we want a fresh read.
    // `.with()` calls `new JulesClientImpl(...)`.
    const jules = defaultJules.with({}); // Should re-read env vars if not provided in options?
    // Wait, client.ts:
    // constructor(options: JulesOptions = {}) {
    //   this.options = options;
    //   const apiKey = options.apiKey ?? process.env.JULES_API_KEY;
    // ...
    // with(options) calls new JulesClientImpl({ ...this.options, ...options })
    // If defaultJules was init with {}, this.options is {}.
    // .with({}) calls new JulesClientImpl({}).
    // The new constructor WILL re-read process.env.JULES_API_KEY.
    // PERFECT.

    // Awaiting a method that requires the API key should throw the specific error
    await expect(
      jules.session({
        prompt: 'test',
        source: { github: 'test/repo', baseBranch: 'main' },
      }),
    ).rejects.toThrow(MissingApiKeyError);
  });

  it('should use the default baseUrl if not provided', () => {
    const jules = defaultJules.with({ apiKey: 'test-key' }) as JulesClientImpl;
    // @ts-expect-error apiClient is private, but we access it for this test
    expect(jules.apiClient['baseUrl']).toBe(
      'https://jules.googleapis.com/v1alpha',
    );
  });

  it('should allow overriding the baseUrl', () => {
    const customUrl = 'http://localhost:8080';
    const jules = defaultJules.with({
      apiKey: 'test-key',
      baseUrl: customUrl,
    }) as JulesClientImpl;
    // @ts-expect-error apiClient is private, but we access it for this test
    expect(jules.apiClient['baseUrl']).toBe(customUrl);
  });
});

describe('Configuration', () => {
  it('should apply default config values when none are provided', () => {
    const jules = defaultJules.with({ apiKey: 'test-key' }) as JulesClientImpl;
    // @ts-expect-error config is private, but we access it for this test
    const config = jules.config;
    expect(config.pollingIntervalMs).toBe(5000);
    expect(config.requestTimeoutMs).toBe(30000);

    // @ts-expect-error apiClient is private
    const apiClient = jules.apiClient;
    // @ts-expect-error requestTimeoutMs is private
    expect(apiClient.requestTimeoutMs).toBe(30000);
  });

  it('should allow overriding config values', () => {
    const jules = defaultJules.with({
      apiKey: 'test-key',
      config: {
        pollingIntervalMs: 1000,
        requestTimeoutMs: 10000,
      },
    }) as JulesClientImpl;

    // @ts-expect-error config is private
    const config = jules.config;
    expect(config.pollingIntervalMs).toBe(1000);
    expect(config.requestTimeoutMs).toBe(10000);

    // @ts-expect-error apiClient is private
    const apiClient = jules.apiClient;
    // @ts-expect-error requestTimeoutMs is private
    expect(apiClient.requestTimeoutMs).toBe(10000);
  });

  it('should only override the specified config value', () => {
    const jules = defaultJules.with({
      apiKey: 'test-key',
      config: {
        pollingIntervalMs: 9999,
      },
    }) as JulesClientImpl;
    // @ts-expect-error config is private
    const config = jules.config;
    expect(config.pollingIntervalMs).toBe(9999);
    expect(config.requestTimeoutMs).toBe(30000); // Should remain default
  });
});
