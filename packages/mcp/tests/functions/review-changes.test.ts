import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reviewChanges } from '../../src/functions/review-changes.js';
import {
  createMockClient,
  createMockSnapshot,
  mockSessionWithSnapshot,
} from './helpers.js';

describe('reviewChanges', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns summary for session with changes', async () => {
    const snapshot = createMockSnapshot({
      id: 'session-changes',
      state: 'completed',
      title: 'Session with Changes',
      url: 'http://example.com/session-changes',
      changeSet: {
        source: 'agent',
        unidiffPatch: `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1 +1,2 @@
 const a = 1;
+const b = 2;`,
      },
    });
    mockSessionWithSnapshot(mockClient, snapshot);

    const result = await reviewChanges(mockClient, 'session-changes');

    expect(result.sessionId).toBe('session-changes');
    expect(result.title).toBe('Session with Changes');
    expect(result.state).toBe('completed');
    expect(result.status).toBe('stable');
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('filters by change type', async () => {
    const snapshot = createMockSnapshot({
      id: 'session-filter',
      state: 'completed',
      title: 'Session for Filtering',
      url: 'http://example.com/session-filter',
      changeSet: {
        source: 'agent',
        unidiffPatch: `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1 @@
+const x = 1;
diff --git a/src/existing.ts b/src/existing.ts
--- a/src/existing.ts
+++ b/src/existing.ts
@@ -1 +1,2 @@
 const a = 1;
+const b = 2;`,
      },
    });
    mockSessionWithSnapshot(mockClient, snapshot);

    const result = await reviewChanges(mockClient, 'session-filter', {
      filter: 'created',
    });

    expect(result.files.every((f) => f.changeType === 'created')).toBe(true);
  });

  it('throws on missing sessionId', async () => {
    await expect(reviewChanges(mockClient, '')).rejects.toThrow(
      'sessionId is required',
    );
  });

  it('returns minimal detail level', async () => {
    const snapshot = createMockSnapshot({
      id: 'session-minimal',
      state: 'completed',
      title: 'Minimal Detail Session',
      url: 'http://example.com/session-minimal',
    });
    mockSessionWithSnapshot(mockClient, snapshot);

    const result = await reviewChanges(mockClient, 'session-minimal', {
      detail: 'minimal',
    });

    expect(result.sessionId).toBe('session-minimal');
    expect(result.insights).toBeUndefined();
    expect(result.activityCounts).toBeUndefined();
  });

  it('returns full detail level', async () => {
    const snapshot = createMockSnapshot({
      id: 'session-full',
      state: 'completed',
      title: 'Full Detail Session',
      url: 'http://example.com/session-full',
    });
    mockSessionWithSnapshot(mockClient, snapshot);

    const result = await reviewChanges(mockClient, 'session-full', {
      detail: 'full',
    });

    expect(result.sessionId).toBe('session-full');
    expect(result.insights).toBeDefined();
    expect(result.activityCounts).toBeDefined();
  });
});
