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

// tests/session.test.ts
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from 'vitest';
import {
  jules as defaultJules,
  JulesClient,
  SessionClient,
  AutomatedSessionFailedError,
  InvalidStateError,
  JulesError,
} from '../src/index.js';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// --- Mock API Server Setup ---
let capturedRequestBody: any;
let sendMessageBody: any;
let approvePlanCalled = false;

const server = setupServer(
  http.get(
    'https://jules.googleapis.com/v1alpha/sources/github/bobalover/boba-auth',
    () => {
      return HttpResponse.json({
        name: 'sources/github/bobalover/boba-auth',
        githubRepo: {},
      });
    },
  ),
  http.post(
    'https://jules.googleapis.com/v1alpha/sessions',
    async ({ request }) => {
      capturedRequestBody = await request.json();
      return HttpResponse.json({
        id: 'SESSION_123',
        name: 'sessions/SESSION_123',
        ...capturedRequestBody,
      });
    },
  ),
  // General session info endpoint
  http.get(
    'https://jules.googleapis.com/v1alpha/sessions/SESSION_123',
    ({ request }) => {
      return HttpResponse.json({
        id: 'SESSION_123',
        state: 'completed',
        outputs: [{ pullRequest: { url: 'http://pr.url' } }],
      });
    },
  ),
  // Specific endpoint for approve() state check
  http.get(
    'https://jules.googleapis.com/v1alpha/sessions/SESSION_APPROVE',
    () => {
      return HttpResponse.json({
        id: 'SESSION_APPROVE',
        state: 'awaitingPlanApproval',
      });
    },
  ),
  http.get(
    'https://jules.googleapis.com/v1alpha/sessions/SESSION_INVALID_STATE',
    () => {
      return HttpResponse.json({
        id: 'SESSION_INVALID_STATE',
        state: 'inProgress',
      });
    },
  ),
  http.post(
    'https://jules.googleapis.com/v1alpha/sessions/SESSION_APPROVE:approvePlan',
    async () => {
      approvePlanCalled = true;
      return HttpResponse.json({});
    },
  ),
  // Mock for invalid state approval - API returns 400
  http.post(
    'https://jules.googleapis.com/v1alpha/sessions/SESSION_INVALID_STATE:approvePlan',
    async () => {
      approvePlanCalled = true;
      return HttpResponse.json(
        { error: { message: 'Session is not awaiting plan approval' } },
        { status: 400 },
      );
    },
  ),
  http.post(
    'https://jules.googleapis.com/v1alpha/sessions/SESSION_123:sendMessage',
    async ({ request }) => {
      sendMessageBody = await request.json();
      return HttpResponse.json({});
    },
  ),
  http.get('https://jules.googleapis.com/v1alpha/sessions/SESSION_FAIL', () => {
    return HttpResponse.json({
      id: 'SESSION_FAIL',
      state: 'failed',
      outputs: [],
    });
  }),
);

beforeAll(() => {
  server.listen();
  process.env.JULES_FORCE_MEMORY_STORAGE = 'true';
});
afterEach(() => {
  server.resetHandlers();
  capturedRequestBody = undefined;
  sendMessageBody = undefined;
  approvePlanCalled = false;
  vi.useRealTimers();
});

beforeEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
  delete process.env.JULES_FORCE_MEMORY_STORAGE;
});

describe('jules.session()', () => {
  let jules: JulesClient;

  beforeEach(() => {
    jules = defaultJules.with({ apiKey: 'test-key' });
  });

  it('should create a new session with correct defaults', async () => {
    const session = await jules.session({
      prompt: 'Refactor the auth flow.',
      source: { github: 'bobalover/boba-auth', baseBranch: 'main' },
    });

    expect(session).toBeInstanceOf(Object);
    expect(session.id).toBe('SESSION_123');
    expect(capturedRequestBody).toBeDefined();
    expect(capturedRequestBody.requirePlanApproval).toBe(true);
  });

  it('should send AUTO_CREATE_PR when autoPr is true', async () => {
    await jules.session({
      prompt: 'test',
      source: { github: 'bobalover/boba-auth', baseBranch: 'main' },
      autoPr: true,
    });
    expect(capturedRequestBody.automationMode).toBe('AUTO_CREATE_PR');
  });

  it('should send AUTOMATION_MODE_UNSPECIFIED when autoPr is false', async () => {
    await jules.session({
      prompt: 'test',
      source: { github: 'bobalover/boba-auth', baseBranch: 'main' },
      autoPr: false,
    });
    expect(capturedRequestBody.automationMode).toBe(
      'AUTOMATION_MODE_UNSPECIFIED',
    );
  });

  it('should send AUTO_CREATE_PR when autoPr is undefined (default)', async () => {
    await jules.session({
      prompt: 'test',
      source: { github: 'bobalover/boba-auth', baseBranch: 'main' },
    });
    expect(capturedRequestBody.automationMode).toBe('AUTO_CREATE_PR');
  });

  it('should rehydrate a session from an ID without an API call', () => {
    const spy = vi.spyOn(global, 'fetch');
    const session = jules.session('EXISTING_SESSION');
    expect(session.id).toBe('EXISTING_SESSION');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('SessionClient', () => {
  let jules: JulesClient;
  let session: SessionClient;

  beforeEach(() => {
    jules = defaultJules.with({
      apiKey: 'test-key',
      config: { pollingIntervalMs: 10 },
    });
    session = jules.session('SESSION_123');
  });

  describe('waitFor()', () => {
    it('should resolve when the target state is reached', async () => {
      vi.useFakeTimers();
      let callCount = 0;
      server.use(
        http.get(
          'https://jules.googleapis.com/v1alpha/sessions/SESSION_123',
          () => {
            callCount++;
            const state = callCount > 1 ? 'awaitingPlanApproval' : 'inProgress';
            return HttpResponse.json({ id: 'SESSION_123', state });
          },
        ),
      );

      const waitForPromise = session.waitFor('awaitingPlanApproval');

      // The first call happens immediately, without waiting for the timer.
      // We need to wait for the promise to resolve to ensure the first fetch is done.
      await vi.advanceTimersByTimeAsync(1);
      expect(callCount).toBe(1);

      // Now, advance the timer to trigger the second poll.
      await vi.advanceTimersByTimeAsync(10);

      // Wait for the polling to complete.
      await waitForPromise;
      expect(callCount).toBe(2);
    });

    it('should resolve gracefully if the session terminates before the target state', async () => {
      server.use(
        http.get(
          'https://jules.googleapis.com/v1alpha/sessions/SESSION_123',
          () => {
            return HttpResponse.json({ id: 'SESSION_123', state: 'completed' });
          },
        ),
      );
      // This should not hang or throw
      await session.waitFor('awaitingPlanApproval');
    });
  });

  describe('approve()', () => {
    it('should make the approvePlan API call when state is correct', async () => {
      server.use(
        http.get(
          'https://jules.googleapis.com/v1alpha/sessions/SESSION_APPROVE',
          () => {
            return HttpResponse.json({
              id: 'SESSION_APPROVE',
              state: 'awaitingPlanApproval',
            });
          },
        ),
      );
      const approveSession = jules.session('SESSION_APPROVE');
      await approveSession.approve();
      expect(approvePlanCalled).toBe(true);
    });

    it('should call API and throw error if session is not awaiting plan approval', async () => {
    // The approve() method now calls the API directly without pre-checking state.
    // The API returns a 400 error for invalid state.
      const invalidStateSession = jules.session('SESSION_INVALID_STATE');
      await expect(invalidStateSession.approve()).rejects.toThrow();
      // API was called (no pre-check)
      expect(approvePlanCalled).toBe(true);
    });
  });

  describe('send()', () => {
    it('should make the sendMessage API call with the correct payload', async () => {
      await session.send('Make it corgi-themed.');
      expect(sendMessageBody).toBeDefined();
      expect(sendMessageBody.prompt).toBe('Make it corgi-themed.');
    });
  });

  describe('ask()', () => {
    it('should send a message and return the corresponding reply', async () => {
      const startTime = new Date();
      vi.useFakeTimers();
      vi.setSystemTime(startTime);

      server.use(
        http.get(
          'https://jules.googleapis.com/v1alpha/sessions/SESSION_123/activities',
          () => {
            return HttpResponse.json({
              activities: [
                {
                  name: 'a/1',
                  createTime: new Date(startTime.getTime() + 100).toISOString(),
                  agentMessaged: { agentMessage: 'Okay, I did it.' },
                },
                {
                  name: 'a/2',
                  createTime: new Date(startTime.getTime() + 200).toISOString(),
                  sessionCompleted: {},
                },
              ],
            });
          },
        ),
      );

      const reply = await session.ask('Did you update the CSS?');
      expect(sendMessageBody.prompt).toBe('Did you update the CSS?');
      expect(reply.type).toBe('agentMessaged');
      expect(reply.message).toBe('Okay, I did it.');
    });

    it.skip('should filter out messages created before the ask was sent', async () => {
      const testStartTime = new Date();
      vi.useFakeTimers();
      vi.setSystemTime(testStartTime);

      server.use(
        http.get(
          'https://jules.googleapis.com/v1alpha/sessions/SESSION_123/activities',
          () => {
            const replyTime = new Date(testStartTime.getTime() + 1); // Ensure this is after the ask() call
            return HttpResponse.json({
              activities: [
                {
                  name: 'a/0',
                  createTime: new Date(
                    testStartTime.getTime() - 1000,
                  ).toISOString(),
                  agentMessaged: { agentMessage: 'This is an old message.' },
                },
                {
                  name: 'a/1',
                  createTime: replyTime.toISOString(),
                  agentMessaged: { agentMessage: 'This is the new reply.' },
                },
                {
                  name: 'a/2',
                  createTime: new Date(replyTime.getTime() + 1).toISOString(),
                  sessionCompleted: {},
                },
              ],
            });
          },
        ),
      );

      const reply = await session.ask('Is this a new question?');

      expect(reply.message).toBe('This is the new reply.');
    });

    it('should throw an error if the session ends before a reply is received', async () => {
      const failSession = jules.session('SESSION_FAIL_EARLY');
      vi.useFakeTimers();
      server.use(
        http.post(
          'https://jules.googleapis.com/v1alpha/sessions/SESSION_FAIL_EARLY:sendMessage',
          () => {
            return HttpResponse.json({});
          },
        ),
        http.get(
          'https://jules.googleapis.com/v1alpha/sessions/SESSION_FAIL_EARLY/activities',
          () => {
            return HttpResponse.json({
              activities: [
                {
                  name: 'a/1',
                  createTime: new Date(Date.now() + 1000).toISOString(),
                  sessionCompleted: {},
                },
              ],
            });
          },
        ),
      );

      const askPromise = failSession.ask('Will you reply?');
      await vi.advanceTimersByTimeAsync(1000);
      await expect(askPromise).rejects.toThrow(JulesError);
    });
  });

  it('result() should wait for completion and return the outcome', async () => {
    const outcome = await session.result();
    expect(outcome.state).toBe('completed');
    expect(outcome.pullRequest?.url).toBe('http://pr.url');
  });

  it('result() should throw RunFailedError on failure', async () => {
    const failedSession = jules.session('SESSION_FAIL');
    await expect(failedSession.result()).rejects.toThrow(
      AutomatedSessionFailedError,
    );
  });

  describe('stream()', () => {
    it('should filter out user messages when requested', async () => {
      server.use(
        http.get(
          'https://jules.googleapis.com/v1alpha/sessions/SESSION_123/activities',
          () => {
            return HttpResponse.json({
              activities: [
                {
                  name: 'a/1',
                  originator: 'user',
                  createTime: new Date().toISOString(),
                  userMessaged: { message: 'Hello from user' },
                },
                {
                  name: 'a/2',
                  originator: 'agent',
                  createTime: new Date().toISOString(),
                  agentMessaged: { agentMessage: 'Hello from agent' },
                },
                {
                  name: 'a/3',
                  createTime: new Date().toISOString(),
                  sessionCompleted: {},
                },
              ],
            });
          },
        ),
      );

      const stream = session.stream({ exclude: { originator: 'user' } });
      const iterator = stream[Symbol.asyncIterator]();

      const { value: activity1 } = await iterator.next();
      const { value: activity2 } = await iterator.next();
      if (iterator.return) {
        await iterator.return(undefined);
      }

      const receivedActivities = [activity1, activity2];

      expect(receivedActivities.length).toBe(2);
      expect(
        receivedActivities.some((a) => a.originator === 'user'),
      ).toBeFalsy();
      expect(
        receivedActivities.some((a) => a.type === 'agentMessaged'),
      ).toBeTruthy();
    });
  });
});
