import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showDiff } from '../../src/functions/show-diff.js';
import {
  createMockClient,
  createMockSnapshot,
  mockSessionWithSnapshot,
} from './helpers.js';

describe('showDiff', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns full unidiff for session', async () => {
    const unidiffPatch = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1 +1,2 @@
 const a = 1;
+const b = 2;`;

    const snapshot = createMockSnapshot({
      id: 'session-diff',
      state: 'completed',
      title: 'Session with Diff',
      url: 'http://example.com/session-diff',
      changeSet: {
        source: 'agent',
        unidiffPatch,
      },
    });
    mockSessionWithSnapshot(mockClient, snapshot);

    const result = await showDiff(mockClient, 'session-diff');

    expect(result.sessionId).toBe('session-diff');
    expect(result.unidiffPatch).toContain('diff --git');
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('filters to specific file', async () => {
    const unidiffPatch = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1,2 @@
 const a = 1;
+const b = 2;
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1 +1,2 @@
 const x = 1;
+const y = 2;`;

    const snapshot = createMockSnapshot({
      id: 'session-filter-file',
      state: 'completed',
      title: 'Session with Multiple Files',
      url: 'http://example.com/session-filter-file',
      changeSet: {
        source: 'agent',
        unidiffPatch,
      },
    });
    mockSessionWithSnapshot(mockClient, snapshot);

    const result = await showDiff(mockClient, 'session-filter-file', {
      file: 'src/a.ts',
    });

    expect(result.file).toBe('src/a.ts');
    expect(result.unidiffPatch).toContain('src/a.ts');
    expect(result.unidiffPatch).not.toContain('src/b.ts');
  });

  it('returns empty for session with no changes', async () => {
    const snapshot = createMockSnapshot({
      id: 'session-no-changes',
      state: 'completed',
      title: 'Session without Changes',
      url: 'http://example.com/session-no-changes',
    });
    mockSessionWithSnapshot(mockClient, snapshot);

    const result = await showDiff(mockClient, 'session-no-changes');

    expect(result.sessionId).toBe('session-no-changes');
    expect(result.unidiffPatch).toBe('');
    expect(result.files).toHaveLength(0);
  });

  it('throws on missing sessionId', async () => {
    await expect(showDiff(mockClient, '')).rejects.toThrow(
      'sessionId is required',
    );
  });
});
