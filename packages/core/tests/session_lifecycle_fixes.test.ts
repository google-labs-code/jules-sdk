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

// tests/session_lifecycle_fixes.test.ts
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
import { jules as defaultJules } from '../src/index.js';
import { http, HttpResponse } from 'msw';
import { TimeoutError } from '../src/errors.js';

// Set up the mock server
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const API_KEY = 'test-api-key';
const BASE_URL = 'https://jules.googleapis.com/v1alpha';
const MOCK_SESSION_ID = 'lifecycle-session-123';

describe('Session Lifecycle Fixes', () => {
  const jules = defaultJules.with({
    apiKey: API_KEY,
    config: { pollingIntervalMs: 10 }, // Fast polling for tests
  });

  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  describe('autoPr Behavior', () => {
    it('should send AUTO_CREATE_PR when autoPr is explicitly true', async () => {
      let requestBody: any;
      server.use(
        http.post(`${BASE_URL}/sessions`, async ({ request }) => {
          requestBody = await request.json();
          return HttpResponse.json({
            id: MOCK_SESSION_ID,
            name: `sessions/${MOCK_SESSION_ID}`,
          });
        }),
      );

      await jules.session({
        prompt: 'test',
        autoPr: true,
      });

      expect(requestBody.automationMode).toBe('AUTO_CREATE_PR');
    });

    it('should send AUTOMATION_MODE_UNSPECIFIED when autoPr is explicitly false', async () => {
      let requestBody: any;
      server.use(
        http.post(`${BASE_URL}/sessions`, async ({ request }) => {
          requestBody = await request.json();
          return HttpResponse.json({
            id: MOCK_SESSION_ID,
            name: `sessions/${MOCK_SESSION_ID}`,
          });
        }),
      );

      await jules.session({
        prompt: 'test',
        autoPr: false,
      });

      expect(requestBody.automationMode).toBe('AUTOMATION_MODE_UNSPECIFIED');
    });

    it('should send AUTO_CREATE_PR when autoPr is undefined (default)', async () => {
      let requestBody: any;
      server.use(
        http.post(`${BASE_URL}/sessions`, async ({ request }) => {
          requestBody = await request.json();
          return HttpResponse.json({
            id: MOCK_SESSION_ID,
            name: `sessions/${MOCK_SESSION_ID}`,
          });
        }),
      );

      await jules.session({
        prompt: 'test',
      });

      expect(requestBody.automationMode).toBe('AUTO_CREATE_PR');
    });
  });

  describe('Polling Timeout', () => {
    it('should throw TimeoutError if result() times out', async () => {
      const julesWithShortTimeout = defaultJules.with({
        apiKey: API_KEY,
        config: {
          pollingIntervalMs: 100,
          pollingTimeoutMs: 500, // Short timeout
        },
      });

      server.use(
        http.post(`${BASE_URL}/sessions`, () =>
          HttpResponse.json({
            id: MOCK_SESSION_ID,
            name: `sessions/${MOCK_SESSION_ID}`,
            state: 'inProgress',
          }),
        ),
        http.get(`${BASE_URL}/sessions/${MOCK_SESSION_ID}`, () =>
          HttpResponse.json({
            id: MOCK_SESSION_ID,
            name: `sessions/${MOCK_SESSION_ID}`,
            state: 'inProgress', // Always in progress
          }),
        ),
      );

      const session = await julesWithShortTimeout.session({
        prompt: 'test',
      });

      const resultPromise = session.result();
      const assertion = expect(resultPromise).rejects.toThrow(TimeoutError);

      // Advance time beyond timeout
      await vi.advanceTimersByTimeAsync(1000);

      await assertion;
    });
  });
});
