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

// tests/repoless.test.ts
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { jules as defaultJules, parseUnidiff } from '../src/index.js';
import type { ParsedChangeSet } from '../src/types.js';

const API_KEY = 'test-api-key';
const BASE_URL = 'https://jules.googleapis.com/v1alpha';
const MOCK_SESSION_ID = 'repoless-session-123';

// Mock server for repoless session tests
const server = setupServer(
  // Repoless session creation - no sourceContext required
  http.post(`${BASE_URL}/sessions`, async ({ request }) => {
    const body = (await request.json()) as any;
    // Verify no sourceContext is included for repoless sessions
    return HttpResponse.json({
      id: MOCK_SESSION_ID,
      name: `sessions/${MOCK_SESSION_ID}`,
      // Echo back whether sourceContext was included (for test verification)
      _test_had_sourceContext: body.sourceContext !== undefined,
    });
  }),
  // Session info endpoint with changeSet output
  http.get(`${BASE_URL}/sessions/${MOCK_SESSION_ID}`, () => {
    return HttpResponse.json({
      id: MOCK_SESSION_ID,
      state: 'completed',
      outputs: [
        {
          // Note: API may not include 'type' field - just 'changeSet' directly
          changeSet: {
            source: 'sources/github/',
            gitPatch: {
              unidiffPatch: `diff --git a/hello.ts b/hello.ts
new file mode 100644
index 0000000..abc123
--- /dev/null
+++ b/hello.ts
@@ -0,0 +1,3 @@
+export function hello() {
+  return 'world';
+}`,
              suggestedCommitMessage: 'Add hello function',
            },
          },
        },
      ],
    });
  }),
  // Activities endpoint
  http.get(`${BASE_URL}/sessions/${MOCK_SESSION_ID}/activities`, () => {
    return HttpResponse.json({
      activities: [{ name: 'a/1', sessionCompleted: {} }],
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Repoless Sessions', () => {
  const jules = defaultJules.with({
    apiKey: API_KEY,
    config: { pollingIntervalMs: 10 },
  });

  beforeAll(() => {
    vi.useFakeTimers();
    process.env.JULES_FORCE_MEMORY_STORAGE = 'true';
  });

  afterAll(() => {
    vi.useRealTimers();
    delete process.env.JULES_FORCE_MEMORY_STORAGE;
  });

  describe('Session Creation without source', () => {
    it('should create a session without sourceContext when source is not provided', async () => {
      let requestBody: any;
      server.use(
        http.post(`${BASE_URL}/sessions`, async ({ request }) => {
          requestBody = await request.json();
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
        http.get(`${BASE_URL}/sessions/${MOCK_SESSION_ID}`, () => {
          return HttpResponse.json({
            id: MOCK_SESSION_ID,
            state: 'completed',
            outputs: [],
          });
        }),
      );

      // Create session without source (repoless)
      const run = await jules.run({
        prompt: 'Explain async/await in TypeScript',
        // Note: NO source property
      });

      await vi.advanceTimersByTimeAsync(0);

      // Verify no sourceContext in request
      expect(requestBody).toBeDefined();
      expect(requestBody.sourceContext).toBeUndefined();
      expect(requestBody.prompt).toBe('Explain async/await in TypeScript');
    });

    it('should include sourceContext when source IS provided', async () => {
      let requestBody: any;
      server.use(
        http.get(`${BASE_URL}/sources/github/owner/repo`, () => {
          return HttpResponse.json({
            name: 'sources/github/owner/repo',
            githubRepo: {},
          });
        }),
        http.post(`${BASE_URL}/sessions`, async ({ request }) => {
          requestBody = await request.json();
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
        http.get(`${BASE_URL}/sessions/${MOCK_SESSION_ID}`, () => {
          return HttpResponse.json({
            id: MOCK_SESSION_ID,
            state: 'completed',
            outputs: [],
          });
        }),
      );

      // Create session WITH source
      const run = await jules.run({
        prompt: 'Add dark mode',
        source: { github: 'owner/repo', baseBranch: 'main' },
      });

      await vi.advanceTimersByTimeAsync(0);

      // Verify sourceContext IS included
      expect(requestBody).toBeDefined();
      expect(requestBody.sourceContext).toBeDefined();
      expect(requestBody.sourceContext.source).toBe(
        'sources/github/owner/repo',
      );
    });
  });

  describe('SessionOutput type discrimination', () => {
    it('should handle changeSet output without explicit type field', async () => {
      // This tests the API quirk where outputs don't have a 'type' discriminator
      const session = jules.session(MOCK_SESSION_ID);
      const info = await session.info();

      expect(info.outputs).toHaveLength(1);
      const output = info.outputs[0];

      // The SDK should handle outputs that have changeSet but may not have type
      // Check if we can access the changeSet
      if ('changeSet' in output) {
        expect(output.changeSet).toBeDefined();
        expect(output.changeSet.source).toBe('sources/github/');
        expect(output.changeSet.gitPatch.unidiffPatch).toContain('hello.ts');
      }
    });
  });
});

describe('parseUnidiff utility export', () => {
  it('should be importable from the main index', () => {
    expect(typeof parseUnidiff).toBe('function');
  });

  it('should parse a simple file creation', () => {
    const patch = `diff --git a/new.ts b/new.ts
new file mode 100644
index 0000000..abc123
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,2 @@
+const x = 1;
+export { x };`;

    const files = parseUnidiff(patch);

    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({
      path: 'new.ts',
      changeType: 'created',
      additions: 2,
      deletions: 0,
    });
  });

  it('should return empty array for undefined input', () => {
    expect(parseUnidiff(undefined)).toEqual([]);
  });

  it('should return empty array for null input', () => {
    expect(parseUnidiff(null)).toEqual([]);
  });

  it('should work standalone for session outputs (integration pattern)', () => {
    // This demonstrates how to use parseUnidiff with session outputs
    const mockSessionOutput = {
      changeSet: {
        source: 'sources/github/',
        gitPatch: {
          unidiffPatch: `diff --git a/file.ts b/file.ts
index abc..def 100644
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 export { a };`,
          suggestedCommitMessage: 'Add b constant',
        },
      },
    };

    // Parse the diff from session output
    const files = parseUnidiff(
      mockSessionOutput.changeSet.gitPatch.unidiffPatch,
    );

    expect(files).toHaveLength(1);
    expect(files[0].changeType).toBe('modified');
    expect(files[0].additions).toBe(1);
    expect(files[0].deletions).toBe(0);

    // Create summary like the SDK does
    const summary = {
      totalFiles: files.length,
      created: files.filter((f) => f.changeType === 'created').length,
      modified: files.filter((f) => f.changeType === 'modified').length,
      deleted: files.filter((f) => f.changeType === 'deleted').length,
    };

    expect(summary).toEqual({
      totalFiles: 1,
      created: 0,
      modified: 1,
      deleted: 0,
    });
  });
});
