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
  buildPRFileOwnership,
  detectPROverlaps,
  partitionPRs,
  fetchPRFiles,
  planMergeOrder,
} from '../merge/ops/plan-merge-order.js';
import type { PR } from '../shared/schemas/pr.js';

// ── Helpers ─────────────────────────────────────────────────────────

function makePR(number: number): PR {
  return {
    number,
    headRef: `branch-${number}`,
    headSha: `sha-${number}`,
    body: `PR #${number} body`,
  };
}

function createMockOctokit(
  filesByPR: Record<number, string[]>,
  shouldFail: number[] = [],
) {
  return {
    rest: {
      pulls: {
        listFiles: vi.fn().mockImplementation(({ pull_number }: any) => {
          if (shouldFail.includes(pull_number)) {
            throw new Error('API error');
          }
          const files = filesByPR[pull_number] ?? [];
          return Promise.resolve({
            data: files.map((filename) => ({
              filename,
              status: 'modified',
              additions: 1,
              deletions: 0,
              changes: 1,
            })),
          });
        }),
      },
    },
  } as any;
}

// ── buildPRFileOwnership ────────────────────────────────────────────

describe('buildPRFileOwnership', () => {
  it('builds ownership map from PR file data', () => {
    const prFiles = new Map<number, string[]>([
      [1, ['src/a.py', 'src/b.py']],
      [2, ['src/b.py', 'src/c.py']],
    ]);
    const ownership = buildPRFileOwnership(prFiles);

    expect(ownership.get('src/a.py')).toEqual([1]);
    expect(ownership.get('src/b.py')).toEqual([1, 2]);
    expect(ownership.get('src/c.py')).toEqual([2]);
  });

  it('handles empty file lists', () => {
    const prFiles = new Map<number, string[]>([
      [1, []],
      [2, ['src/a.py']],
    ]);
    const ownership = buildPRFileOwnership(prFiles);
    expect(ownership.size).toBe(1);
    expect(ownership.get('src/a.py')).toEqual([2]);
  });
});

// ── detectPROverlaps ────────────────────────────────────────────────

describe('detectPROverlaps', () => {
  it('extracts files owned by 2+ PRs', () => {
    const ownership = new Map<string, number[]>([
      ['src/a.py', [1]],
      ['src/b.py', [1, 2]],
      ['src/c.py', [2, 3]],
    ]);
    const overlaps = detectPROverlaps(ownership);
    expect(overlaps).toHaveLength(2);
    expect(overlaps).toContainEqual({ file: 'src/b.py', prs: [1, 2] });
    expect(overlaps).toContainEqual({ file: 'src/c.py', prs: [2, 3] });
  });

  it('returns empty array when no overlaps', () => {
    const ownership = new Map<string, number[]>([
      ['src/a.py', [1]],
      ['src/b.py', [2]],
    ]);
    expect(detectPROverlaps(ownership)).toEqual([]);
  });
});

// ── partitionPRs ────────────────────────────────────────────────────

describe('partitionPRs', () => {
  it('returns empty plan for zero PRs', () => {
    const plan = partitionPRs([], new Map());
    expect(plan).toEqual({ independent: [], conflictGroups: [] });
  });

  it('classifies single PR as independent', () => {
    const prs = [makePR(1)];
    const prFiles = new Map([[1, ['src/a.py']]]);
    const plan = partitionPRs(prs, prFiles);

    expect(plan.independent).toHaveLength(1);
    expect(plan.independent[0].number).toBe(1);
    expect(plan.conflictGroups).toHaveLength(0);
  });

  it('classifies two PRs with no shared files as both independent', () => {
    const prs = [makePR(1), makePR(2)];
    const prFiles = new Map([
      [1, ['src/a.py']],
      [2, ['src/b.py']],
    ]);
    const plan = partitionPRs(prs, prFiles);

    expect(plan.independent).toHaveLength(2);
    expect(plan.conflictGroups).toHaveLength(0);
  });

  it('groups two PRs sharing one file into a conflict cluster', () => {
    const prs = [makePR(1), makePR(2)];
    const prFiles = new Map([
      [1, ['src/a.py', 'src/shared.py']],
      [2, ['src/b.py', 'src/shared.py']],
    ]);
    const plan = partitionPRs(prs, prFiles);

    expect(plan.independent).toHaveLength(0);
    expect(plan.conflictGroups).toHaveLength(1);
    expect(plan.conflictGroups[0].prs.map((p) => p.number)).toEqual([1, 2]);
    expect(plan.conflictGroups[0].sharedFiles).toEqual(['src/shared.py']);
  });

  it('detects transitive clustering: A↔B, B↔C → all in one cluster', () => {
    const prs = [makePR(1), makePR(2), makePR(3)];
    const prFiles = new Map([
      [1, ['src/a.py', 'src/ab.py']],
      [2, ['src/ab.py', 'src/bc.py']],
      [3, ['src/bc.py', 'src/c.py']],
    ]);
    const plan = partitionPRs(prs, prFiles);

    expect(plan.independent).toHaveLength(0);
    expect(plan.conflictGroups).toHaveLength(1);
    const cluster = plan.conflictGroups[0];
    expect(cluster.prs.map((p) => p.number).sort()).toEqual([1, 2, 3]);
    expect(cluster.sharedFiles.sort()).toEqual(['src/ab.py', 'src/bc.py']);
  });

  it('correctly partitions mix of independent and overlapping PRs', () => {
    const prs = [makePR(1), makePR(2), makePR(3), makePR(4)];
    const prFiles = new Map([
      [1, ['.fleet/doc.md']], // isolated
      [2, ['src/client.py', 'tests/test_client.py']], // overlaps with #3
      [3, ['src/client.py', 'tests/test_models.py']], // overlaps with #2
      [4, ['src/models.py']], // isolated
    ]);
    const plan = partitionPRs(prs, prFiles);

    expect(plan.independent.map((p) => p.number).sort()).toEqual([1, 4]);
    expect(plan.conflictGroups).toHaveLength(1);
    expect(plan.conflictGroups[0].prs.map((p) => p.number).sort()).toEqual([
      2, 3,
    ]);
  });

  it('groups all PRs sharing the same file into one cluster', () => {
    const prs = [makePR(1), makePR(2), makePR(3), makePR(4)];
    const prFiles = new Map([
      [1, ['src/client.py']],
      [2, ['src/client.py']],
      [3, ['src/client.py']],
      [4, ['src/client.py']],
    ]);
    const plan = partitionPRs(prs, prFiles);

    expect(plan.independent).toHaveLength(0);
    expect(plan.conflictGroups).toHaveLength(1);
    expect(plan.conflictGroups[0].prs).toHaveLength(4);
  });

  it('sorts independent PRs by ascending file count then PR number', () => {
    const prs = [makePR(3), makePR(1), makePR(2)];
    const prFiles = new Map([
      [3, ['a.py', 'b.py', 'c.py']], // 3 files
      [1, ['d.py', 'e.py']], // 2 files
      [2, ['f.py']], // 1 file
    ]);
    const plan = partitionPRs(prs, prFiles);

    expect(plan.independent.map((p) => p.number)).toEqual([2, 1, 3]);
  });

  it('sorts within conflict cluster by ascending overlap score then PR number', () => {
    const prs = [makePR(3), makePR(1), makePR(2)];
    // PR 1 overlaps on 2 files, PR 2 overlaps on 1 file, PR 3 overlaps on 1 file
    const prFiles = new Map([
      [1, ['src/shared1.py', 'src/shared2.py']], // overlaps in 2 files
      [2, ['src/shared1.py', 'unique.py']], // overlaps in 1 file
      [3, ['src/shared2.py', 'other.py']], // overlaps in 1 file
    ]);
    const plan = partitionPRs(prs, prFiles);

    expect(plan.conflictGroups).toHaveLength(1);
    // PR 2 and 3 have overlap score 1, PR 1 has overlap score 2
    // PR 2 before 3 (tie-break by number), then PR 1
    expect(plan.conflictGroups[0].prs.map((p) => p.number)).toEqual([2, 3, 1]);
  });

  it('handles PR with empty file list in a cluster (does not crash)', () => {
    const prs = [makePR(1), makePR(2)];
    const prFiles = new Map([
      [1, []],
      [2, ['src/a.py']],
    ]);
    const plan = partitionPRs(prs, prFiles);

    // No overlap since PR 1 has no files
    expect(plan.independent).toHaveLength(2);
    expect(plan.conflictGroups).toHaveLength(0);
  });

  it('treats same file path with different statuses as overlap', () => {
    // Even if one PR adds and another modifies the same file, it's an overlap
    const prs = [makePR(1), makePR(2)];
    const prFiles = new Map([
      [1, ['src/new_file.py']],
      [2, ['src/new_file.py']],
    ]);
    const plan = partitionPRs(prs, prFiles);

    expect(plan.conflictGroups).toHaveLength(1);
    expect(plan.conflictGroups[0].sharedFiles).toEqual(['src/new_file.py']);
  });

  it('different file paths are not overlaps even if basenames match', () => {
    const prs = [makePR(1), makePR(2)];
    const prFiles = new Map([
      [1, ['tests/test_client.py']],
      [2, ['src/test_client.py']],
    ]);
    const plan = partitionPRs(prs, prFiles);

    expect(plan.independent).toHaveLength(2);
    expect(plan.conflictGroups).toHaveLength(0);
  });
});

// ── fetchPRFiles ────────────────────────────────────────────────────

describe('fetchPRFiles', () => {
  it('fetches changed files for each PR', async () => {
    const octokit = createMockOctokit({
      1: ['src/a.py', 'src/b.py'],
      2: ['src/c.py'],
    });
    const prs = [makePR(1), makePR(2)];
    const result = await fetchPRFiles(octokit, 'owner', 'repo', prs);

    expect(result.get(1)).toEqual(['src/a.py', 'src/b.py']);
    expect(result.get(2)).toEqual(['src/c.py']);
  });

  it('returns empty file list on API error (non-fatal)', async () => {
    const octokit = createMockOctokit({ 1: ['src/a.py'] }, [2]);
    const prs = [makePR(1), makePR(2)];
    const result = await fetchPRFiles(octokit, 'owner', 'repo', prs);

    expect(result.get(1)).toEqual(['src/a.py']);
    expect(result.get(2)).toEqual([]); // failed gracefully
  });

  it('handles PRs with no changed files', async () => {
    const octokit = createMockOctokit({ 1: [] });
    const prs = [makePR(1)];
    const result = await fetchPRFiles(octokit, 'owner', 'repo', prs);

    expect(result.get(1)).toEqual([]);
  });
});

// ── planMergeOrder (integration) ────────────────────────────────────

describe('planMergeOrder', () => {
  it('produces correct plan for the production scenario', async () => {
    // Mirrors the actual jules-sdk-python merge run:
    // #52: .fleet/insight_38.md  (isolated doc)
    // #53: client.py, test_client.py  (overlaps with #54, #55, #57)
    // #54: test_client.py, test_models.py  (overlaps with #53, #56)
    // #55: client.py, test_client.py  (overlaps with #53, #54)
    // #56: models.py, test_models.py  (overlaps with #54)
    // #57: client.py  (overlaps with #53, #55)
    const octokit = createMockOctokit({
      52: ['.fleet/insight_38.md'],
      53: ['src/jules/client.py', 'tests/test_client.py'],
      54: ['tests/test_client.py', 'tests/test_models.py'],
      55: ['src/jules/client.py', 'tests/test_client.py'],
      56: ['src/jules/models.py', 'tests/test_models.py'],
      57: ['src/jules/client.py'],
    });

    const prs = [makePR(52), makePR(53), makePR(54), makePR(55), makePR(56), makePR(57)];
    const plan = await planMergeOrder(octokit, 'owner', 'repo', prs);

    // #52 should be independent (isolated .fleet/ file)
    expect(plan.independent.map((p) => p.number)).toEqual([52]);

    // All others are connected through overlapping files
    expect(plan.conflictGroups).toHaveLength(1);
    const cluster = plan.conflictGroups[0];
    expect(cluster.prs.map((p) => p.number).sort()).toEqual([53, 54, 55, 56, 57]);

    // Shared files should include all overlapping files
    expect(cluster.sharedFiles.sort()).toEqual([
      'src/jules/client.py',
      'tests/test_client.py',
      'tests/test_models.py',
    ]);
  });
});
