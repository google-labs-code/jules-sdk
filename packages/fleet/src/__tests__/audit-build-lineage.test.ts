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
import { buildLineage } from '../audit/graph/build-lineage.js';
import { nodeKey } from '../audit/graph/types.js';

/**
 * Create a mock Octokit that returns predictable data for the graph builder tests.
 *
 * Scenario: Issue #10 → PR #42 (via timeline) → Check Run 111
 *   - Issue #10 has fleet label and Fleet Context footer
 *   - PR #42 is on a jules/ branch and fixes issue #10
 */
function createGraphMockOctokit() {
  return {
    rest: {
      issues: {
        get: vi.fn().mockImplementation(({ issue_number }: any) => {
          if (issue_number === 10) {
            return {
              data: {
                number: 10,
                title: 'Fix the bug',
                state: 'open',
                labels: [{ name: 'fleet' }, { name: 'fleet-assessment' }],
                body: 'Fix this bug\n\n---\n**Fleet Context**\n- Source: `jules:session:s-abc123`',
                milestone: { number: 1, title: 'Sprint 3' },
              },
            };
          }
          throw new Error(`Issue ${issue_number} not found`);
        }),
        listEventsForTimeline: vi.fn().mockImplementation(({ issue_number }: any) => {
          if (issue_number === 10) {
            return {
              data: [
                {
                  event: 'cross-referenced',
                  source: { issue: { number: 42, pull_request: {} } },
                },
              ],
            };
          }
          return { data: [] };
        }),
        getMilestone: vi.fn().mockResolvedValue({
          data: { number: 1, title: 'Sprint 3', state: 'open' },
        }),
        listForRepo: vi.fn().mockResolvedValue({
          data: [
            { number: 10 },
            { number: 42, pull_request: {} },
          ],
        }),
      },
      pulls: {
        get: vi.fn().mockImplementation(({ pull_number }: any) => {
          if (pull_number === 42) {
            return {
              data: {
                number: 42,
                title: 'Fix the bug (#10)',
                state: 'open',
                head: { ref: 'jules/fix-issue-10/s-abc123', sha: 'sha-42' },
                merged: false,
                body: 'Fixes #10',
                milestone: { number: 1, title: 'Sprint 3' },
              },
            };
          }
          throw new Error(`PR ${pull_number} not found`);
        }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: {
            check_runs: [{ id: 111 }],
          },
        }),
      },
    },
    graphql: vi.fn().mockImplementation((_query: string, vars: any) => {
      if (vars.prNumber === 42) {
        return {
          repository: {
            pullRequest: {
              closingIssuesReferences: {
                nodes: [{ number: 10 }],
              },
            },
          },
        };
      }
      return {
        repository: {
          pullRequest: {
            closingIssuesReferences: { nodes: [] },
          },
        },
      };
    }),
  } as any;
}

describe('buildLineage', () => {
  it('builds 1-depth graph from issue entry point', async () => {
    const octokit = createGraphMockOctokit();
    const graph = await buildLineage(
      { octokit },
      'owner',
      'repo',
      { kind: 'issue', id: '10' },
      { depth: 1 },
    );

    // Root should be the issue
    expect(graph.root).toEqual({ kind: 'issue', id: '10' });

    // Should have issue #10 + PR #42 + milestone 1 + session s-abc123
    expect(graph.nodes.size).toBeGreaterThanOrEqual(3);
    expect(graph.nodes.has('issue:10')).toBe(true);
    expect(graph.nodes.has('pr:42')).toBe(true);
    expect(graph.nodes.has('session:s-abc123')).toBe(true);
  });

  it('builds 2-depth graph expanding PR → checks', async () => {
    const octokit = createGraphMockOctokit();
    const graph = await buildLineage(
      { octokit },
      'owner',
      'repo',
      { kind: 'issue', id: '10' },
      { depth: 2 },
    );

    // At depth 2, PR #42 should expand to include check-runs
    expect(graph.nodes.has('check-run:111')).toBe(true);
  });

  it('deduplicates nodes visited from multiple paths', async () => {
    const octokit = createGraphMockOctokit();
    const graph = await buildLineage(
      { octokit },
      'owner',
      'repo',
      { kind: 'issue', id: '10' },
      { depth: 2 },
    );

    // Issue #10 should appear only once even though PR #42 also links to it
    const issueNodes = Array.from(graph.nodes.values()).filter(
      (n) => n.ref.kind === 'issue' && n.ref.id === '10',
    );
    expect(issueNodes).toHaveLength(1);
  });

  it('respects depth limit — stops expanding at max depth', async () => {
    const octokit = createGraphMockOctokit();
    const depth0Graph = await buildLineage(
      { octokit },
      'owner',
      'repo',
      { kind: 'issue', id: '10' },
      { depth: 0 },
    );

    // At depth 0, only the root issue should be fetched (no neighbors expanded)
    expect(depth0Graph.nodes.size).toBe(1);
    expect(depth0Graph.nodes.has('issue:10')).toBe(true);
  });

  it('tracks unresolved edges for fleet issues without Fleet Context', async () => {
    // Create an issue without Fleet Context footer but with fleet label
    const octokit = createGraphMockOctokit();
    octokit.rest.issues.get.mockResolvedValueOnce({
      data: {
        number: 99,
        title: 'Old issue',
        state: 'open',
        labels: [{ name: 'fleet' }],
        body: 'This issue has no Fleet Context footer',
        milestone: null,
      },
    });
    octokit.rest.issues.listEventsForTimeline.mockResolvedValueOnce({
      data: [],
    });

    const graph = await buildLineage(
      { octokit },
      'owner',
      'repo',
      { kind: 'issue', id: '99' },
      { depth: 1 },
    );

    expect(graph.unresolvedEdges).toHaveLength(1);
    expect(graph.unresolvedEdges[0]).toEqual({
      from: { kind: 'issue', id: '99' },
      expectedRelation: 'dispatched',
      reason: 'No Fleet Context footer in issue body',
    });
  });

  it('tracks unresolved edges for jules/ PRs without session ID', async () => {
    const octokit = createGraphMockOctokit();
    octokit.rest.pulls.get.mockResolvedValueOnce({
      data: {
        number: 50,
        title: 'Manual Jules PR',
        state: 'open',
        head: { ref: 'jules/manual-fix', sha: 'sha-50' },
        merged: false,
        body: 'Some fix with no session info',
        milestone: null,
      },
    });
    octokit.graphql.mockResolvedValueOnce({
      repository: {
        pullRequest: {
          closingIssuesReferences: { nodes: [] },
        },
      },
    });

    const graph = await buildLineage(
      { octokit },
      'owner',
      'repo',
      { kind: 'pr', id: '50' },
      { depth: 1 },
    );

    const prUnresolved = graph.unresolvedEdges.find(
      (e) => e.from.kind === 'pr' && e.from.id === '50',
    );
    expect(prUnresolved).toBeDefined();
    expect(prUnresolved!.expectedRelation).toBe('produced');
    expect(prUnresolved!.reason).toContain('jules/ branch');
  });

  it('handles API errors gracefully', async () => {
    const octokit = {
      rest: {
        issues: {
          get: vi.fn().mockRejectedValue(new Error('API rate limited')),
        },
      },
    } as any;

    await expect(
      buildLineage({ octokit }, 'owner', 'repo', { kind: 'issue', id: '10' }),
    ).rejects.toThrow('API rate limited');
  });
});
