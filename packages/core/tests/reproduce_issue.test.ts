
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { jules as defaultJules, JulesClient } from '../src/index.js';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

let capturedRequestBody: any;

const server = setupServer(
  http.get(
    'https://jules.googleapis.com/v1alpha/sources/github/test-owner/test-repo',
    () => {
      return HttpResponse.json({
        name: 'sources/github/test-owner/test-repo',
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
);

beforeAll(() => {
  server.listen();
  process.env.JULES_FORCE_MEMORY_STORAGE = 'true';
});
afterEach(() => {
  server.resetHandlers();
  capturedRequestBody = undefined;
  vi.useRealTimers();
});
afterAll(() => {
  server.close();
  delete process.env.JULES_FORCE_MEMORY_STORAGE;
});

describe('jules.session() autoPr behavior', () => {
  let jules: JulesClient;

  beforeEach(() => {
    jules = defaultJules.with({ apiKey: 'test-key' });
  });

  it('should set automationMode to AUTO_CREATE_PR when autoPr is true', async () => {
    await jules.session({
      prompt: 'Test prompt',
      source: { github: 'test-owner/test-repo', baseBranch: 'main' },
      autoPr: true,
    });

    expect(capturedRequestBody.automationMode).toBe('AUTO_CREATE_PR');
  });

  it('should set automationMode to AUTOMATION_MODE_UNSPECIFIED when autoPr is false', async () => {
    await jules.session({
      prompt: 'Test prompt',
      source: { github: 'test-owner/test-repo', baseBranch: 'main' },
      autoPr: false,
    });

    expect(capturedRequestBody.automationMode).toBe('AUTOMATION_MODE_UNSPECIFIED');
  });
});
