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

import { describe, it, expect, vi } from 'vitest';
import {
  batchResolveConflicts,
  buildBatchPrompt,
} from '../merge/ops/resolve-conflicts.js';
import type { PR } from '../shared/schemas/pr.js';
import type { BatchResolveInput } from '../merge/ops/resolve-conflicts.js';

// ── Helpers ─────────────────────────────────────────────────────────

function makePR(number: number, body?: string): PR {
  return {
    number,
    headRef: `branch-${number}`,
    headSha: `sha-${number}`,
    body: body ?? `PR #${number} body`,
  };
}

function makeInput(overrides?: Partial<BatchResolveInput>): BatchResolveInput {
  return {
    owner: 'testowner',
    repo: 'testrepo',
    baseBranch: 'main',
    conflictingPRs: [makePR(1), makePR(2)],
    sharedFiles: ['src/client.py'],
    recentlyMerged: [10],
    ...overrides,
  };
}

function createMockOctokit(
  diffsByPR: Record<number, string>,
  diffFailures: number[] = [],
  commentFailures: number[] = [],
) {
  const createComment = vi.fn().mockImplementation(({ issue_number }: any) => {
    if (commentFailures.includes(issue_number)) {
      throw new Error('Comment API error');
    }
    return Promise.resolve({ data: {} });
  });

  return {
    rest: {
      pulls: {
        get: vi.fn().mockImplementation(({ pull_number }: any) => {
          if (diffFailures.includes(pull_number)) {
            throw new Error('Diff API error');
          }
          return Promise.resolve({
            data: diffsByPR[pull_number] ?? '',
          });
        }),
      },
      issues: {
        createComment,
      },
    },
    _createComment: createComment,
  } as any;
}

function createMockJulesProvider(sessionId = 'session-123', shouldFail = false) {
  const sessionFn = vi.fn().mockImplementation(() => {
    if (shouldFail) {
      throw new Error('Jules API error');
    }
    return Promise.resolve({ id: sessionId });
  });

  return {
    provider: { session: sessionFn } as any,
    sessionFn,
  };
}

const noopEmit = () => {};

// ── buildBatchPrompt ────────────────────────────────────────────────

describe('buildBatchPrompt', () => {
  it('includes diff and recently merged PRs for a single conflicting PR', () => {
    const input = makeInput({
      conflictingPRs: [makePR(54, 'Fixes #43: test coverage')],
      recentlyMerged: [52, 53],
    });
    const diffs = new Map([[54, '--- a/tests/test_client.py\n+++ b/tests/test_client.py']]);
    const prompt = buildBatchPrompt(input, diffs);

    expect(prompt).toContain('PR #54');
    expect(prompt).toContain('Fixes #43');
    expect(prompt).toContain('test_client.py');
    expect(prompt).toContain('PR #52');
    expect(prompt).toContain('PR #53');
  });

  it('includes both diffs and shared files for two conflicting PRs', () => {
    const input = makeInput({
      conflictingPRs: [makePR(54), makePR(55)],
      sharedFiles: ['src/client.py', 'tests/test_client.py'],
    });
    const diffs = new Map([
      [54, 'diff-54'],
      [55, 'diff-55'],
    ]);
    const prompt = buildBatchPrompt(input, diffs);

    expect(prompt).toContain('PR #54');
    expect(prompt).toContain('PR #55');
    expect(prompt).toContain('diff-54');
    expect(prompt).toContain('diff-55');
    expect(prompt).toContain('`src/client.py`');
    expect(prompt).toContain('`tests/test_client.py`');
  });

  it('handles empty diffs gracefully', () => {
    const input = makeInput({
      conflictingPRs: [makePR(1)],
    });
    const diffs = new Map([[1, '']]);
    const prompt = buildBatchPrompt(input, diffs);

    expect(prompt).toContain('PR #1');
    // Should not contain empty code block
    expect(prompt).not.toContain('```diff\n\n```');
  });

  it('includes instructions to not duplicate work', () => {
    const input = makeInput();
    const prompt = buildBatchPrompt(input, new Map());

    expect(prompt).toContain('Create ONE PR');
    expect(prompt).toContain('Do NOT duplicate work');
  });

  it('handles no recently merged PRs', () => {
    const input = makeInput({ recentlyMerged: [] });
    const prompt = buildBatchPrompt(input, new Map());

    expect(prompt).not.toContain('Recently Merged');
  });
});

// ── batchResolveConflicts ───────────────────────────────────────────

describe('batchResolveConflicts', () => {
  it('dispatches exactly one session for a batch of N conflicting PRs', async () => {
    const octokit = createMockOctokit({ 1: 'diff-1', 2: 'diff-2' });
    const { provider, sessionFn } = createMockJulesProvider('session-abc');
    const input = makeInput();

    const result = await batchResolveConflicts(octokit, input, noopEmit, provider);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.sessionId).toBe('session-abc');
      expect(result.resolvedPRs).toEqual([1, 2]);
    }
    // Jules session should be called exactly once
    expect(sessionFn).toHaveBeenCalledTimes(1);
  });

  it('targets correct repo and base branch', async () => {
    const octokit = createMockOctokit({ 1: 'diff-1' });
    const { provider, sessionFn } = createMockJulesProvider();
    const input = makeInput({
      owner: 'myorg',
      repo: 'myrepo',
      baseBranch: 'develop',
      conflictingPRs: [makePR(1)],
    });

    await batchResolveConflicts(octokit, input, noopEmit, provider);

    expect(sessionFn).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { github: 'myorg/myrepo', baseBranch: 'develop' },
        requireApproval: false,
        autoPr: true,
      }),
    );
  });

  it('returns error on dispatch failure (does not throw)', async () => {
    const octokit = createMockOctokit({ 1: 'diff-1' });
    const { provider } = createMockJulesProvider('', true);
    const input = makeInput({ conflictingPRs: [makePR(1)] });

    const result = await batchResolveConflicts(octokit, input, noopEmit, provider);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Jules API error');
    }
  });

  it('still dispatches when diff fetch fails for one PR (non-fatal)', async () => {
    const octokit = createMockOctokit({ 1: 'diff-1' }, [2]); // PR 2 diff fails
    const { provider, sessionFn } = createMockJulesProvider('session-xyz');
    const input = makeInput();

    const result = await batchResolveConflicts(octokit, input, noopEmit, provider);

    expect(result.success).toBe(true);
    // Session should still be dispatched
    expect(sessionFn).toHaveBeenCalledTimes(1);
    // The prompt should still contain PR #2 even with empty diff
    const promptArg = sessionFn.mock.calls[0][0].prompt;
    expect(promptArg).toContain('PR #2');
  });

  it('does NOT close original PRs', async () => {
    const octokit = createMockOctokit({ 1: 'diff-1', 2: 'diff-2' });
    const { provider } = createMockJulesProvider();
    const input = makeInput();

    await batchResolveConflicts(octokit, input, noopEmit, provider);

    // Verify pulls.update was never called (which would close PRs)
    expect(octokit.rest.pulls.update).toBeUndefined();
  });

  it('adds comment to each original PR explaining batch resolution', async () => {
    const octokit = createMockOctokit({ 1: 'diff-1', 2: 'diff-2' });
    const { provider } = createMockJulesProvider('session-123');
    const input = makeInput();

    await batchResolveConflicts(octokit, input, noopEmit, provider);

    const createComment = octokit._createComment;
    expect(createComment).toHaveBeenCalledTimes(2);

    // Check first call
    const firstCall = createComment.mock.calls[0][0];
    expect(firstCall.issue_number).toBe(1);
    expect(firstCall.body).toContain('Batch conflict resolution');
    expect(firstCall.body).toContain('#1');
    expect(firstCall.body).toContain('#2');
    expect(firstCall.body).toContain('session-123');

    // Check second call
    const secondCall = createComment.mock.calls[1][0];
    expect(secondCall.issue_number).toBe(2);
  });

  it('succeeds even when commenting fails (non-fatal)', async () => {
    const octokit = createMockOctokit({ 1: 'diff-1', 2: 'diff-2' }, [], [1, 2]);
    const { provider } = createMockJulesProvider('session-abc');
    const input = makeInput();

    const result = await batchResolveConflicts(octokit, input, noopEmit, provider);

    // Should still succeed — comments are non-fatal
    expect(result.success).toBe(true);
  });

  it('emits start and done events', async () => {
    const octokit = createMockOctokit({ 1: 'diff-1' });
    const { provider } = createMockJulesProvider('session-xyz');
    const events: any[] = [];
    const emit = (e: any) => events.push(e);
    const input = makeInput({ conflictingPRs: [makePR(1)] });

    await batchResolveConflicts(octokit, input, emit, provider);

    expect(events).toContainEqual(
      expect.objectContaining({ type: 'merge:batch-resolve:start' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'merge:batch-resolve:done',
        sessionId: 'session-xyz',
      }),
    );
  });

  it('emits error event on dispatch failure', async () => {
    const octokit = createMockOctokit({ 1: 'diff-1' });
    const { provider } = createMockJulesProvider('', true);
    const events: any[] = [];
    const emit = (e: any) => events.push(e);
    const input = makeInput({ conflictingPRs: [makePR(1)] });

    await batchResolveConflicts(octokit, input, emit, provider);

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'BATCH_RESOLVE_FAILED',
      }),
    );
  });
});
