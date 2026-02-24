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

// tests/automated_session.test.ts
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
import {
  AutomatedSessionFailedError,
  SourceNotFoundError,
} from '../src/errors.js';
import { Activity } from '../src/types.js';

// Set up the mock server
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const API_KEY = 'test-api-key';
const BASE_URL = 'https://jules.googleapis.com/v1alpha';
const MOCK_SESSION_ID = 'run-session-123';

const MOCK_AUTOMATED_SESSION_CONFIG = {
  prompt: 'Add a dark mode toggle.',
  source: { github: 'davideast/dataprompt', baseBranch: 'main' },
};

describe('jules.run()', () => {
  const jules = defaultJules.with({
    apiKey: API_KEY,
    config: { pollingIntervalMs: 100 },
  });

  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  // Test for initial session setup and validation
  it('should throw SourceNotFoundError if the source cannot be resolved', async () => {
    await expect(
      jules.run({
        ...MOCK_AUTOMATED_SESSION_CONFIG,
        source: { github: 'non/existent', baseBranch: 'main' },
      }),
    ).rejects.toThrow(SourceNotFoundError);
  });

  // Test for correct session creation payload
  it('should create a session with correct parameters', async () => {
    let requestBody: any;
    server.use(
      http.post(`${BASE_URL}/sessions`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          id: MOCK_SESSION_ID,
          name: `sessions/${MOCK_SESSION_ID}`,
        });
      }),
      // Mock dependent calls to allow the run to complete cleanly
      http.get(`${BASE_URL}/sessions/${MOCK_SESSION_ID}/activities`, () => {
        return HttpResponse.json({
          activities: [{ name: 'a/1', sessionCompleted: {} }],
        });
      }),
      http.get(`${BASE_URL}/sessions/${MOCK_SESSION_ID}`, () => {
        return HttpResponse.json({
          id: MOCK_SESSION_ID,
          state: 'COMPLETED',
          outputs: [],
        });
      }),
    );

    const automatedSession = await jules.run(MOCK_AUTOMATED_SESSION_CONFIG);
    await vi.advanceTimersByTimeAsync(0); // Allow session creation to complete

    expect(requestBody.sourceContext.source).toBe(
      'sources/github/davideast/dataprompt',
    );
    expect(requestBody.requirePlanApproval).toBe(false);

    // Await the automated session to ensure all background activity completes
    await expect(automatedSession.result()).resolves.toBeDefined();
  });

  // Test successful run: stream and final outcome
  it('should stream activities and resolve with the correct Outcome on success', async () => {
    server.use(
      http.post(`${BASE_URL}/sessions`, () =>
        HttpResponse.json({
          id: MOCK_SESSION_ID,
          name: `sessions/${MOCK_SESSION_ID}`,
        }),
      ),
      http.get(`${BASE_URL}/sessions/${MOCK_SESSION_ID}/activities`, () => {
        return HttpResponse.json({
          activities: [{ name: 'a/1', sessionCompleted: {} }],
        });
      }),
      http.get(`${BASE_URL}/sessions/${MOCK_SESSION_ID}`, () => {
        return HttpResponse.json({
          id: MOCK_SESSION_ID,
          state: 'COMPLETED',
          outputs: [
            {
              pullRequest: {
                url: 'http://pr',
                title: 'Title',
                description: 'Desc',
              },
            },
          ],
        });
      }),
    );

    const automatedSession = await jules.run(MOCK_AUTOMATED_SESSION_CONFIG);

    const iterator = automatedSession.stream()[Symbol.asyncIterator]();
    const { value: activity } = await iterator.next();
    await iterator.return!();

    const outcome = await automatedSession.result();

    expect(activity.type).toBe('sessionCompleted');
    expect(outcome.state).toBe('completed');
    expect(outcome.pullRequest?.url).toBe('http://pr');
  });

  // Test failed run: stream and final outcome
  it('should stream activities and reject with AutomatedSessionFailedError on failure', async () => {
    server.use(
      http.post(`${BASE_URL}/sessions`, () =>
        HttpResponse.json({
          id: MOCK_SESSION_ID,
          name: `sessions/${MOCK_SESSION_ID}`,
        }),
      ),
      http.get(`${BASE_URL}/sessions/${MOCK_SESSION_ID}/activities`, () => {
        return HttpResponse.json({
          activities: [{ name: 'a/1', sessionFailed: { reason: 'API Error' } }],
        });
      }),
      http.get(`${BASE_URL}/sessions/${MOCK_SESSION_ID}`, () => {
        return HttpResponse.json({ id: MOCK_SESSION_ID, state: 'FAILED' });
      }),
    );
    const automatedSession = await jules.run(MOCK_AUTOMATED_SESSION_CONFIG);
    const promise = expect(automatedSession.result()).rejects.toThrow(
      AutomatedSessionFailedError,
    );

    const iterator = automatedSession.stream()[Symbol.asyncIterator]();
    const { value: activity } = await iterator.next();
    await iterator.return!();

    expect(activity.type).toBe('sessionFailed');
    await promise;
  });

  // Critical test for ensuring stream works immediately
  it('should handle calling .stream() immediately after run resolves', async () => {
    server.use(
      http.post(`${BASE_URL}/sessions`, () => {
        return HttpResponse.json({
          id: MOCK_SESSION_ID,
          name: `sessions/${MOCK_SESSION_ID}`,
        });
      }),
      http.get(`${BASE_URL}/sessions/${MOCK_SESSION_ID}/activities`, () => {
        return HttpResponse.json({
          activities: [{ name: 'a/1', sessionCompleted: {} }],
        });
      }),
    );

    const automatedSession = await jules.run(MOCK_AUTOMATED_SESSION_CONFIG);
    const stream = automatedSession.stream();
    const iterator = stream[Symbol.asyncIterator]();

    // Advance timers to allow the stream to process
    await vi.advanceTimersByTimeAsync(100);
    const { value: activity } = await iterator.next();
    await iterator.return!();

    expect(activity.type).toBe('sessionCompleted');
  });

  it('should reflect automation settings in session info', async () => {
    const sessionId = 'auto-session-1';
    server.use(
      http.post(`${BASE_URL}/sessions`, () =>
        HttpResponse.json({
          id: sessionId,
          name: `sessions/${sessionId}`,
          automationMode: 'AUTO_CREATE_PR',
          requirePlanApproval: false,
        }),
      ),
      http.get(`${BASE_URL}/sessions/${sessionId}`, () =>
        HttpResponse.json({
          id: sessionId,
          automationMode: 'AUTO_CREATE_PR',
          requirePlanApproval: false,
        }),
      ),
      // Mock dependent calls
      http.get(`${BASE_URL}/sessions/${sessionId}/activities`, () => {
        return HttpResponse.json({ activities: [] });
      }),
    );

    const run = await jules.run({
      ...MOCK_AUTOMATED_SESSION_CONFIG,
      autoPr: true,
    });

    // We can verify by fetching info via session client
    const info = await jules.session(run.id).info();

    expect(info.automationMode).toBe('AUTO_CREATE_PR');
    expect(info.requirePlanApproval).toBe(false);
  });

  it('should reflect approval settings in session info', async () => {
    const sessionId = 'approval-session-1';
    server.use(
      http.post(`${BASE_URL}/sessions`, () =>
        HttpResponse.json({
          id: sessionId,
          name: `sessions/${sessionId}`,
          requirePlanApproval: true,
        }),
      ),
      http.get(`${BASE_URL}/sessions/${sessionId}`, () =>
        HttpResponse.json({
          id: sessionId,
          requirePlanApproval: true,
        }),
      ),
    );

    const session = await jules.session({
      ...MOCK_AUTOMATED_SESSION_CONFIG,
      requireApproval: true,
    });

    const info = await session.info();
    expect(info.requirePlanApproval).toBe(true);
  });

  it('should identify archived sessions', async () => {
    const sessionId = 'archived-session-1';
    server.use(
      http.get(`${BASE_URL}/sessions/${sessionId}`, () =>
        HttpResponse.json({
          id: sessionId,
          archived: true,
        }),
      ),
    );

    const session = jules.session(sessionId);
    const info = await session.info();
    expect(info.archived).toBe(true);
  });
});
