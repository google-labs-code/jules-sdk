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
import { buildLineage } from '../audit/graph/build-lineage.js';
import type { NodeRef } from '../audit/graph/types.js';

// Mock all edge resolvers to return empty arrays (we only care about node data)
vi.mock('../audit/ops/resolve-pr-to-issues.js', () => ({
  resolvePRToIssues: vi.fn().mockResolvedValue([]),
}));
vi.mock('../audit/ops/resolve-issue-to-prs.js', () => ({
  resolveIssueToPRs: vi.fn().mockResolvedValue([]),
}));
vi.mock('../audit/ops/resolve-issue-to-session.js', () => ({
  resolveIssueToSession: vi.fn().mockReturnValue(null),
}));
vi.mock('../audit/ops/resolve-pr-to-session.js', () => ({
  resolvePRToSession: vi.fn().mockReturnValue(null),
}));
vi.mock('../audit/ops/resolve-pr-to-checks.js', () => ({
  resolvePRToChecks: vi.fn().mockResolvedValue([]),
}));
vi.mock('../audit/ops/resolve-milestone-to-items.js', () => ({
  resolveMilestoneToItems: vi.fn().mockResolvedValue([]),
}));

describe('build-lineage: PR node data includes labels', () => {
  it('populates labels on PR graph nodes from Octokit response', async () => {
    const mockOctokit = {
      rest: {
        pulls: {
          get: vi.fn().mockResolvedValue({
            data: {
              number: 145,
              title: 'Fix list sessions',
              state: 'open',
              labels: [
                { id: 1, name: 'fleet-merge-ready', color: '0e8a16' },
                { id: 2, name: 'bug', color: 'd73a4a' },
              ],
              head: { ref: 'fix/something', sha: 'abc123' },
              merged: false,
              body: 'Fixes #100',
              milestone: null,
            },
          }),
        },
      },
    } as any;

    const startNode: NodeRef = { kind: 'pr', id: '145' };
    const graph = await buildLineage(
      { octokit: mockOctokit },
      'davideast',
      'jules-sdk-python',
      startNode,
      { depth: 0 }, // depth 0: only resolve the start node
    );

    const prNode = graph.nodes.get('pr:145');
    expect(prNode).toBeDefined();

    // This is the critical assertion — PR node data MUST include labels
    expect(prNode!.data.labels).toBeDefined();
    expect(prNode!.data.labels).toEqual([
      expect.objectContaining({ name: 'fleet-merge-ready' }),
      expect.objectContaining({ name: 'bug' }),
    ]);
  });
});
