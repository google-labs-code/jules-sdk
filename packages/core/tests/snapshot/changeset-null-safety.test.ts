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

import { describe, it, expect } from 'vitest';
import { SessionSnapshotImpl } from '../../src/snapshot.js';
import { SessionResource, SessionOutcome, PullRequest } from '../../src/types.js';

/**
 * Tests for the changeSet null-safety fix in SessionSnapshotImpl.
 *
 * Bug: When session.outcome.changeSet is undefined or not a function,
 * snapshot.changeSet() would throw "TypeError: snapshot.changeSet is not a function"
 */
describe('SessionSnapshotImpl changeSet null-safety', () => {
  const createMockOutcome = (changeSet?: any): SessionOutcome => ({
    sessionId: 'test-session',
    title: 'Test Session',
    state: 'completed',
    outputs: [],
    pullRequest: undefined,
    generatedFiles: () => ({ all: () => [], get: () => undefined, filter: () => [] }),
    changeSet,
  });

  const createBaseSessionResource = (overrides: Partial<SessionResource> = {}): SessionResource => ({
    name: 'sessions/test-session',
    id: 'test-session',
    state: 'completed',
    createTime: '2026-01-01T00:00:00Z',
    updateTime: '2026-01-01T00:01:00Z',
    prompt: 'test prompt',
    title: 'Test Session',
    url: 'http://test.url',
    sourceContext: {} as any,
    source: {
      name: 'sources/github/test/repo',
      id: 'github/test/repo',
      type: 'githubRepo',
      githubRepo: { owner: 'test', repo: 'repo', isPrivate: false },
    },
    outputs: [],
    outcome: createMockOutcome(() => undefined),
    ...overrides,
  } as SessionResource);

  it('should handle outcome with valid changeSet function', () => {
    const mockChangeSet = { gitPatch: { unidiffPatch: 'diff --git a/file.ts' } };
    const session = createBaseSessionResource({
      outcome: createMockOutcome(() => mockChangeSet),
    });

    const snapshot = new SessionSnapshotImpl({ data: { session, activities: [] } });

    expect(typeof snapshot.changeSet).toBe('function');
    expect(snapshot.changeSet()).toEqual(mockChangeSet);
  });

  it('should handle outcome with undefined changeSet', () => {
    const session = createBaseSessionResource({
      outcome: createMockOutcome(undefined),
    });

    const snapshot = new SessionSnapshotImpl({ data: { session, activities: [] } });

    expect(typeof snapshot.changeSet).toBe('function');
    expect(snapshot.changeSet()).toBeUndefined();
  });

  it('should handle outcome with non-function changeSet (raw object)', () => {
    // This simulates the bug where changeSet is a raw object instead of a function
    const rawChangeSet = { gitPatch: { unidiffPatch: 'diff --git a/file.ts' } };
    const session = createBaseSessionResource({
      outcome: createMockOutcome(rawChangeSet as any), // Intentionally wrong type
    });

    const snapshot = new SessionSnapshotImpl({ data: { session, activities: [] } });

    // Should still be a function, not throw
    expect(typeof snapshot.changeSet).toBe('function');
    expect(snapshot.changeSet()).toBeUndefined();
  });

  it('should handle outcome with null changeSet', () => {
    const session = createBaseSessionResource({
      outcome: createMockOutcome(null as any),
    });

    const snapshot = new SessionSnapshotImpl({ data: { session, activities: [] } });

    expect(typeof snapshot.changeSet).toBe('function');
    expect(snapshot.changeSet()).toBeUndefined();
  });

  it('should handle session without outcome (fallback path)', () => {
    const session = createBaseSessionResource({
      outcome: undefined,
    });

    const snapshot = new SessionSnapshotImpl({ data: { session, activities: [] } });

    expect(typeof snapshot.changeSet).toBe('function');
    expect(snapshot.changeSet()).toBeUndefined();
  });
});
