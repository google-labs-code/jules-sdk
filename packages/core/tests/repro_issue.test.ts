// packages/core/tests/repro_issue.test.ts
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from 'vitest';
import {
  jules as defaultJules,
  JulesClient,
  TimeoutError,
} from '../src/index.js';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

let capturedRequestBody: any;

const server = setupServer(
  http.get(
    'https://jules.googleapis.com/v1alpha/sources/github/owner/repo',
    () => {
      return HttpResponse.json({
        name: 'sources/github/owner/repo',
        githubRepo: {},
      });
    },
  ),
  http.post(
    'https://jules.googleapis.com/v1alpha/sessions',
    async ({ request }) => {
      capturedRequestBody = await request.json();
      return HttpResponse.json({
        id: 'SESSION_TEST',
        name: 'sessions/SESSION_TEST',
        ...capturedRequestBody,
      });
    },
  ),
  http.get(
    'https://jules.googleapis.com/v1alpha/sessions/SESSION_TEST',
    () => {
      // Always return running state to trigger timeout
      return HttpResponse.json({
        id: 'SESSION_TEST',
        state: 'inProgress',
      });
    },
  ),
);

beforeAll(() => {
  server.listen();
  process.env.JULES_FORCE_MEMORY_STORAGE = 'true';
});

afterEach(() => {
  server.resetHandlers();
  capturedRequestBody = undefined;
});

afterAll(() => {
  server.close();
  delete process.env.JULES_FORCE_MEMORY_STORAGE;
});

describe('Reproduction Tests', () => {
  let jules: JulesClient;

  beforeEach(() => {
    jules = defaultJules.with({
      apiKey: 'test-key',
      config: { pollingIntervalMs: 10 },
    });
  });

  it('Issue #24: session() should set automationMode based on config.autoPr', async () => {
    // Case 1: autoPr = true
    await jules.session({
      prompt: 'Test prompt',
      source: { github: 'owner/repo', baseBranch: 'main' },
      autoPr: true,
    });
    expect(capturedRequestBody.automationMode).toBe('AUTO_CREATE_PR');

    // Case 2: autoPr = false (default behavior)
    await jules.session({
      prompt: 'Test prompt',
      source: { github: 'owner/repo', baseBranch: 'main' },
      autoPr: false,
    });
    expect(capturedRequestBody.automationMode).toBe(
      'AUTOMATION_MODE_UNSPECIFIED',
    );

    // Case 3: autoPr undefined (default behavior)
    await jules.session({
      prompt: 'Test prompt',
      source: { github: 'owner/repo', baseBranch: 'main' },
    });
    expect(capturedRequestBody.automationMode).toBe(
      'AUTOMATION_MODE_UNSPECIFIED',
    );
  });

  it('Issue #23: session.result() should support timeoutMs', async () => {
    const session = await jules.session({
      prompt: 'Test prompt',
      source: { github: 'owner/repo', baseBranch: 'main' },
    });

    // We expect this to fail with TimeoutError because the mock server returns 'inProgress' forever
    // and we set a short timeout.
    await expect(session.result({ timeoutMs: 50 })).rejects.toThrow(
      TimeoutError,
    );
  });

  it('Issue #23: run().result() should support timeoutMs', async () => {
    const run = await jules.run({
      prompt: 'Test prompt',
      source: { github: 'owner/repo', baseBranch: 'main' },
    });

    // We expect this to fail with TimeoutError because the mock server returns 'inProgress' forever
    // and we set a short timeout.
    await expect(run.result({ timeoutMs: 50 })).rejects.toThrow(TimeoutError);
  });
});
