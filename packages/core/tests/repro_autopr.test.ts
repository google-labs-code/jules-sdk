
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
} from '../src/index.js';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// --- Mock API Server Setup ---
let capturedRequestBody: any;

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
        id: 'SESSION_REPRO',
        name: 'sessions/SESSION_REPRO',
        ...capturedRequestBody,
      });
    },
  )
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

beforeEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
  delete process.env.JULES_FORCE_MEMORY_STORAGE;
});

describe('Reproduction: jules.session() autoPr', () => {
  let jules: JulesClient;

  beforeEach(() => {
    jules = defaultJules.with({ apiKey: 'test-key' });
  });

  it('demonstrates the bug: autoPr: true is ignored in session()', async () => {
    await jules.session({
      prompt: 'Refactor the auth flow.',
      source: { github: 'bobalover/boba-auth', baseBranch: 'main' },
      autoPr: true,
    });

    expect(capturedRequestBody).toBeDefined();
    // This assertion confirms the CURRENT BROKEN behavior
    expect(capturedRequestBody.automationMode).toBe('AUTOMATION_MODE_UNSPECIFIED');
  });
});
