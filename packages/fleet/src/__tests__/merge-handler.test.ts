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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MergeHandler } from '../merge/handler.js';
import type { MergeInput } from '../merge/spec.js';

/** No-op sleep for tests */
const noopSleep = async () => { };

function createMockOctokit(overrides: Record<string, any> = {}) {
  return {
    rest: {
      pulls: {
        list: vi.fn().mockResolvedValue({ data: [] }),
        get: vi.fn().mockResolvedValue({
          data: { head: { sha: 'abc123' } },
        }),
        merge: vi.fn().mockResolvedValue({ data: {} }),
        update: vi.fn().mockResolvedValue({ data: {} }),
        updateBranch: vi.fn().mockResolvedValue({ data: {} }),
        ...overrides.pulls,
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: { check_runs: [] },
        }),
        ...overrides.checks,
      },
    },
  } as any;
}

const baseInput: MergeInput = {
  mode: 'label',
  baseBranch: 'main',
  admin: false,
  redispatch: false,

  maxCIWaitSeconds: 1,
  maxRetries: 2,
  pollTimeoutSeconds: 1,
  owner: 'google',
  repo: 'jules-sdk',
};

function makePR(number: number, labels: string[] = []) {
  return {
    number,
    head: { ref: `branch-${number}`, sha: `sha-${number}` },
    body: `PR #${number} body`,
    labels: labels.map((name) => ({ name })),
  };
}

describe('MergeHandler (Logic Tests)', () => {
  it('returns empty result when no PRs found', async () => {
    const octokit = createMockOctokit();
    const handler = new MergeHandler({ octokit, sleep: noopSleep });
    const result = await handler.execute(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toHaveLength(0);
      expect(result.data.skipped).toHaveLength(0);
    }
  });

  it('merges a single PR when CI passes (no checks)', async () => {
    const octokit = createMockOctokit({
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [makePR(42, ['fleet-merge-ready'])],
        }),
        get: vi.fn().mockResolvedValue({
          data: { head: { sha: 'abc123' } },
        }),
        merge: vi.fn().mockResolvedValue({ data: {} }),
        updateBranch: vi.fn().mockResolvedValue({ data: {} }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: { check_runs: [] },
        }),
      },
    });

    const handler = new MergeHandler({ octokit, sleep: noopSleep });
    const result = await handler.execute(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toEqual([42]);
    }
  });

  it('merges PR when all CI checks pass', async () => {
    const octokit = createMockOctokit({
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [makePR(42, ['fleet-merge-ready'])],
        }),
        get: vi.fn().mockResolvedValue({
          data: { head: { sha: 'abc123' } },
        }),
        merge: vi.fn().mockResolvedValue({ data: {} }),
        updateBranch: vi.fn().mockResolvedValue({ data: {} }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: {
            check_runs: [
              { name: 'CI', status: 'completed', conclusion: 'success' },
              { name: 'Lint', status: 'completed', conclusion: 'skipped' },
            ],
          },
        }),
      },
    });

    const handler = new MergeHandler({ octokit, sleep: noopSleep });
    const result = await handler.execute(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toEqual([42]);
    }
  });

  it('skips PR when CI fails', async () => {
    const octokit = createMockOctokit({
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [makePR(42, ['fleet-merge-ready'])],
        }),
        get: vi.fn().mockResolvedValue({
          data: { head: { sha: 'abc123' } },
        }),
        merge: vi.fn(),
        updateBranch: vi.fn().mockResolvedValue({ data: {} }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: {
            check_runs: [
              { name: 'CI', status: 'completed', conclusion: 'failure' },
            ],
          },
        }),
      },
    });

    const handler = new MergeHandler({ octokit, sleep: noopSleep });
    const result = await handler.execute(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toHaveLength(0);
      expect(result.data.skipped).toEqual([42]);
    }
    // Merge should NOT have been called
    expect(octokit.rest.pulls.merge).not.toHaveBeenCalled();
  });

  it('returns MERGE_FAILED when merge API errors', async () => {
    const octokit = createMockOctokit({
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [makePR(42, ['fleet-merge-ready'])],
        }),
        get: vi.fn().mockResolvedValue({
          data: { head: { sha: 'abc123' } },
        }),
        merge: vi.fn().mockRejectedValue(new Error('Not allowed')),
        updateBranch: vi.fn().mockResolvedValue({ data: {} }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: { check_runs: [] },
        }),
      },
    });

    const handler = new MergeHandler({ octokit, sleep: noopSleep });
    const result = await handler.execute(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MERGE_FAILED');
    }
  });

  it('merges multiple PRs sequentially', async () => {
    const mergeOrder: number[] = [];
    const octokit = createMockOctokit({
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [
            makePR(42, ['fleet-merge-ready']),
            makePR(43, ['fleet-merge-ready']),
          ],
        }),
        get: vi.fn().mockResolvedValue({
          data: { head: { sha: 'abc123' } },
        }),
        merge: vi.fn().mockImplementation(({ pull_number }: any) => {
          mergeOrder.push(pull_number);
          return Promise.resolve({ data: {} });
        }),
        updateBranch: vi.fn().mockResolvedValue({ data: {} }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: { check_runs: [] },
        }),
      },
    });

    const handler = new MergeHandler({ octokit, sleep: noopSleep });
    const result = await handler.execute(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toEqual([42, 43]);
    }
    expect(mergeOrder).toEqual([42, 43]);
  });

  it('detects conflict on first (only) PR and returns CONFLICT_RETRIES_EXHAUSTED', async () => {
    const conflictError = new Error('Conflict') as any;
    conflictError.status = 422;

    const octokit = createMockOctokit({
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [makePR(28, ['fleet-merge-ready'])],
        }),
        get: vi.fn().mockResolvedValue({
          data: { head: { sha: 'abc123' }, mergeable: false },
        }),
        merge: vi.fn(),
        updateBranch: vi.fn().mockRejectedValue(conflictError),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: { check_runs: [] },
        }),
      },
    });

    const handler = new MergeHandler({ octokit, sleep: noopSleep });
    const result = await handler.execute(baseInput);

    // Without redispatch, should return conflict error (not MERGE_FAILED)
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CONFLICT_RETRIES_EXHAUSTED');
      expect(result.error.message).toContain('PR #28');
    }
    // Merge should NOT have been attempted
    expect(octokit.rest.pulls.merge).not.toHaveBeenCalled();
  });

  it('handles conflict via batch path when redispatch is enabled', async () => {
    const conflictError = new Error('Conflict') as any;
    conflictError.status = 422;

    const octokit = createMockOctokit({
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [makePR(28, ['fleet-merge-ready'])],
        }),
        get: vi.fn().mockImplementation(({ mediaType }: any) => {
          if (mediaType?.format === 'diff') {
            return { data: 'diff content' };
          }
          return { data: { head: { sha: 'abc123' }, mergeable: false } };
        }),
        update: vi.fn().mockResolvedValue({ data: {} }),
        updateBranch: vi.fn().mockRejectedValue(conflictError),
        merge: vi.fn(),
        listFiles: vi.fn().mockResolvedValue({
          data: [{ filename: 'src/client.py' }],
        }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: { check_runs: [] },
        }),
      },
      issues: {
        createComment: vi.fn().mockResolvedValue({ data: {} }),
      },
    });

    // Mock the jules import for batch resolve
    vi.doMock('@google/jules-sdk', () => ({
      jules: {
        session: vi.fn().mockResolvedValue({ id: 'batch-session-28' }),
      },
    }));

    const handler = new MergeHandler({ octokit, sleep: noopSleep });
    const result = await handler.execute({
      ...baseInput,
      redispatch: true,
      maxRetries: 0,
    });

    // updateBranch should have been called
    expect(octokit.rest.pulls.updateBranch).toHaveBeenCalledWith(
      expect.objectContaining({ pull_number: 28 }),
    );
    // Merge should NOT have been attempted
    expect(octokit.rest.pulls.merge).not.toHaveBeenCalled();
    // With batch path, result is success with the PR in skipped/redispatched
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skipped).toContain(28);
    }

    vi.doUnmock('@google/jules-sdk');
  });

  it('treats 422 "already up to date" as success, not conflict', async () => {
    const alreadyUpToDateError = new Error('Validation Failed') as any;
    alreadyUpToDateError.status = 422;

    const octokit = createMockOctokit({
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [makePR(46, ['fleet-merge-ready'])],
        }),
        get: vi.fn().mockResolvedValue({
          data: { head: { sha: 'sha-46' }, mergeable: true },
        }),
        merge: vi.fn().mockResolvedValue({ data: {} }),
        updateBranch: vi.fn().mockRejectedValue(alreadyUpToDateError),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: { check_runs: [] },
        }),
      },
    });

    const handler = new MergeHandler({ octokit, sleep: noopSleep });
    const result = await handler.execute(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      // PR should have been merged, not skipped or redispatched
      expect(result.data.merged).toEqual([46]);
      expect(result.data.skipped).toHaveLength(0);
      expect(result.data.redispatched).toHaveLength(0);
    }
    // Merge SHOULD have been called
    expect(octokit.rest.pulls.merge).toHaveBeenCalledWith(
      expect.objectContaining({ pull_number: 46 }),
    );
  });

  it('still detects real 422 merge conflicts', async () => {
    const conflictError = new Error('Validation Failed') as any;
    conflictError.status = 422;

    const octokit = createMockOctokit({
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [makePR(47, ['fleet-merge-ready'])],
        }),
        get: vi.fn().mockResolvedValue({
          data: { head: { sha: 'sha-47' }, mergeable: false },
        }),
        merge: vi.fn(),
        updateBranch: vi.fn().mockRejectedValue(conflictError),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: { check_runs: [] },
        }),
      },
    });

    const handler = new MergeHandler({ octokit, sleep: noopSleep });
    const result = await handler.execute(baseInput);

    // Should still be treated as a conflict (redispatch is off by default)
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CONFLICT_RETRIES_EXHAUSTED');
      expect(result.error.message).toContain('PR #47');
    }
    // Merge should NOT have been attempted
    expect(octokit.rest.pulls.merge).not.toHaveBeenCalled();
  });
});

describe('MergeHandler (Batch Mode Tests)', () => {
  const batchInput: MergeInput = {
    ...baseInput,
    redispatch: true,
    maxRetries: 0,
  };

  it('emits merge:plan:computed when batch mode is enabled', async () => {
    const octokit = createMockOctokit({
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [
            makePR(1, ['fleet-merge-ready']),
            makePR(2, ['fleet-merge-ready']),
          ],
        }),
        get: vi.fn().mockResolvedValue({
          data: { head: { sha: 'abc123' } },
        }),
        merge: vi.fn().mockResolvedValue({ data: {} }),
        updateBranch: vi.fn().mockResolvedValue({ data: {} }),
        listFiles: vi.fn().mockImplementation(({ pull_number }: any) => {
          if (pull_number === 1) return { data: [{ filename: 'a.py' }] };
          return { data: [{ filename: 'b.py' }] };
        }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({ data: { check_runs: [] } }),
      },
    });

    const events: any[] = [];
    const handler = new MergeHandler({
      octokit,
      sleep: noopSleep,
      emit: (e: any) => events.push(e),
    });
    await handler.execute(batchInput);

    const planEvent = events.find((e) => e.type === 'merge:plan:computed');
    expect(planEvent).toBeDefined();
    expect(planEvent.independent.sort()).toEqual([1, 2]);
    expect(planEvent.conflictGroups).toEqual([]);
  });

  it('merges independent PRs before conflict groups', async () => {
    const mergeOrder: number[] = [];
    const octokit = createMockOctokit({
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [
            makePR(1, ['fleet-merge-ready']),
            makePR(2, ['fleet-merge-ready']),
            makePR(3, ['fleet-merge-ready']),
          ],
        }),
        get: vi.fn().mockResolvedValue({
          data: { head: { sha: 'abc123' }, mergeable: false },
        }),
        merge: vi.fn().mockImplementation(({ pull_number }: any) => {
          mergeOrder.push(pull_number);
          return { data: {} };
        }),
        update: vi.fn().mockResolvedValue({ data: {} }),
        updateBranch: vi.fn().mockResolvedValue({ data: {} }),
        listFiles: vi.fn().mockImplementation(({ pull_number }: any) => {
          if (pull_number === 1) return { data: [{ filename: 'isolated.md' }] };
          if (pull_number === 2) return { data: [{ filename: 'shared.py' }] };
          return { data: [{ filename: 'shared.py' }] };
        }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({ data: { check_runs: [] } }),
      },
      issues: {
        createComment: vi.fn().mockResolvedValue({ data: {} }),
      },
    });

    const handler = new MergeHandler({ octokit, sleep: noopSleep });
    const result = await handler.execute(batchInput);

    expect(result.success).toBe(true);
    if (result.success) {
      // PR 1 is independent and should be merged first
      expect(result.data.merged[0]).toBe(1);
    }
  });

  it('given PRs ordered [A(3 files), B(1 file), C(2 files)] independent, merges B→C→A', async () => {
    const mergeOrder: number[] = [];
    const octokit = createMockOctokit({
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [
            makePR(1, ['fleet-merge-ready']),
            makePR(2, ['fleet-merge-ready']),
            makePR(3, ['fleet-merge-ready']),
          ],
        }),
        get: vi.fn().mockResolvedValue({
          data: { head: { sha: 'abc123' } },
        }),
        merge: vi.fn().mockImplementation(({ pull_number }: any) => {
          mergeOrder.push(pull_number);
          return { data: {} };
        }),
        updateBranch: vi.fn().mockResolvedValue({ data: {} }),
        listFiles: vi.fn().mockImplementation(({ pull_number }: any) => {
          if (pull_number === 1) return { data: [{ filename: 'a.py' }, { filename: 'b.py' }, { filename: 'c.py' }] };
          if (pull_number === 2) return { data: [{ filename: 'd.py' }] };
          return { data: [{ filename: 'e.py' }, { filename: 'f.py' }] };
        }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({ data: { check_runs: [] } }),
      },
    });

    const handler = new MergeHandler({ octokit, sleep: noopSleep });
    const result = await handler.execute(batchInput);

    expect(result.success).toBe(true);
    // B(1 file) → C(2 files) → A(3 files)
    expect(mergeOrder).toEqual([2, 3, 1]);
  });

  it('falls back to sequential merge when planMergeOrder API fails', async () => {
    const octokit = createMockOctokit({
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [makePR(42, ['fleet-merge-ready'])],
        }),
        get: vi.fn().mockResolvedValue({
          data: { head: { sha: 'abc123' } },
        }),
        merge: vi.fn().mockResolvedValue({ data: {} }),
        updateBranch: vi.fn().mockResolvedValue({ data: {} }),
        // listFiles throws — planning phase fails
        listFiles: vi.fn().mockRejectedValue(new Error('API rate limit')),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({ data: { check_runs: [] } }),
      },
    });

    const handler = new MergeHandler({ octokit, sleep: noopSleep });
    const result = await handler.execute(batchInput);

    // Should still work via fallback sequential path
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toEqual([42]);
    }
  });

  it('batch resolves conflict group when first PR in group cannot merge', async () => {
    const conflictError = new Error('Conflict') as any;
    conflictError.status = 422;

    const octokit = createMockOctokit({
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [
            makePR(1, ['fleet-merge-ready']),
            makePR(2, ['fleet-merge-ready']),
          ],
        }),
        get: vi.fn().mockImplementation(({ pull_number, mediaType }: any) => {
          if (mediaType?.format === 'diff') {
            return { data: `diff for PR #${pull_number}` };
          }
          return { data: { head: { sha: 'abc' }, mergeable: false } };
        }),
        merge: vi.fn(),
        update: vi.fn().mockResolvedValue({ data: {} }),
        updateBranch: vi.fn().mockRejectedValue(conflictError),
        listFiles: vi.fn().mockImplementation(({ pull_number }: any) => {
          return { data: [{ filename: 'shared.py' }] };
        }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({ data: { check_runs: [] } }),
      },
      issues: {
        createComment: vi.fn().mockResolvedValue({ data: {} }),
      },
    });

    const events: any[] = [];
    const handler = new MergeHandler({
      octokit,
      sleep: noopSleep,
      emit: (e: any) => events.push(e),
    });

    // Mock the jules import for batch resolve
    vi.doMock('@google/jules-sdk', () => ({
      jules: {
        session: vi.fn().mockResolvedValue({ id: 'batch-session-1' }),
      },
    }));

    const result = await handler.execute(batchInput);

    expect(result.success).toBe(true);
    if (result.success) {
      // Both PRs should be in the skipped/redispatched lists
      expect(result.data.merged).toHaveLength(0);
      expect(result.data.skipped).toContain(1);
      expect(result.data.skipped).toContain(2);
    }

    vi.doUnmock('@google/jules-sdk');
  });
});
