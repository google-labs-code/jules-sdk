// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, it, expect } from 'vitest';
import { computeScores, aggregateScores } from '../trace/scoring.js';
import type { SessionTrace } from '../trace/spec.js';

function makeSession(overrides: Partial<SessionTrace> = {}): SessionTrace {
  return {
    sessionId: 'abc123',
    dispatchedBy: null,
    pullRequest: null,
    changedFiles: [],
    events: [],
    environment: 'local',
    ...overrides,
  };
}

describe('computeScores', () => {
  it('returns null mergeSuccess when no PR exists', () => {
    const scores = computeScores(makeSession());
    expect(scores.mergeSuccess).toBeNull();
    expect(scores.filesChanged).toBe(0);
    expect(scores.issueLinked).toBe(false);
  });

  it('returns true mergeSuccess for merged PR', () => {
    const scores = computeScores(
      makeSession({
        pullRequest: { number: 1, title: 'Fix', state: 'closed', merged: true },
        changedFiles: ['a.py', 'b.py'],
      }),
    );
    expect(scores.mergeSuccess).toBe(true);
    expect(scores.filesChanged).toBe(2);
  });

  it('returns false mergeSuccess for unmerged PR', () => {
    const scores = computeScores(
      makeSession({
        pullRequest: { number: 1, title: 'Fix', state: 'open', merged: false },
      }),
    );
    expect(scores.mergeSuccess).toBe(false);
  });

  it('returns true issueLinked when dispatch info exists', () => {
    const scores = computeScores(
      makeSession({
        dispatchedBy: { issueNumber: 4, issueTitle: 'Test' },
      }),
    );
    expect(scores.issueLinked).toBe(true);
  });
});

describe('aggregateScores', () => {
  it('returns null for empty sessions', () => {
    const scores = aggregateScores([]);
    expect(scores.mergeSuccess).toBeNull();
    expect(scores.filesChanged).toBe(0);
    expect(scores.issueLinked).toBe(true); // vacuously true
  });

  it('returns true mergeSuccess when all PRs merged', () => {
    const sessions = [
      makeSession({
        pullRequest: { number: 1, title: 'A', state: 'closed', merged: true },
        changedFiles: ['a.py'],
        dispatchedBy: { issueNumber: 1, issueTitle: 'A' },
      }),
      makeSession({
        pullRequest: { number: 2, title: 'B', state: 'closed', merged: true },
        changedFiles: ['b.py', 'c.py'],
        dispatchedBy: { issueNumber: 2, issueTitle: 'B' },
      }),
    ];
    const scores = aggregateScores(sessions);
    expect(scores.mergeSuccess).toBe(true);
    expect(scores.filesChanged).toBe(3);
    expect(scores.issueLinked).toBe(true);
  });

  it('returns false mergeSuccess when any PR not merged', () => {
    const sessions = [
      makeSession({
        pullRequest: { number: 1, title: 'A', state: 'closed', merged: true },
        dispatchedBy: { issueNumber: 1, issueTitle: 'A' },
      }),
      makeSession({
        pullRequest: { number: 2, title: 'B', state: 'open', merged: false },
        dispatchedBy: { issueNumber: 2, issueTitle: 'B' },
      }),
    ];
    const scores = aggregateScores(sessions);
    expect(scores.mergeSuccess).toBe(false);
  });

  it('returns false issueLinked when any session is unlinked', () => {
    const sessions = [
      makeSession({ dispatchedBy: { issueNumber: 1, issueTitle: 'A' } }),
      makeSession({ dispatchedBy: null }),
    ];
    const scores = aggregateScores(sessions);
    expect(scores.issueLinked).toBe(false);
  });
});
