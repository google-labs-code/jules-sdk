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
  reDispatch: false,
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
    const handler = new MergeHandler(octokit, () => { }, noopSleep);
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

    const handler = new MergeHandler(octokit, () => { }, noopSleep);
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

    const handler = new MergeHandler(octokit, () => { }, noopSleep);
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

    const handler = new MergeHandler(octokit, () => { }, noopSleep);
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

    const handler = new MergeHandler(octokit, () => { }, noopSleep);
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

    const handler = new MergeHandler(octokit, () => { }, noopSleep);
    const result = await handler.execute(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toEqual([42, 43]);
    }
    expect(mergeOrder).toEqual([42, 43]);
  });
});
