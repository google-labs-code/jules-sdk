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
import { collectFindings } from '../audit/pipeline/collect-findings.js';
import type { AuditInput } from '../audit/spec.js';
import type { GraphNode } from '../audit/graph/types.js';

// Mock buildLineage to return overlapping graphs
vi.mock('../audit/graph/build-lineage.js', () => ({
  buildLineage: vi.fn(),
}));

// Mock scanItem to return predictable findings
vi.mock('../audit/ops/scan-item.js', () => ({
  scanItem: vi.fn(),
}));

import { buildLineage } from '../audit/graph/build-lineage.js';
import { scanItem } from '../audit/ops/scan-item.js';

describe('collectFindings deduplication', () => {
  const mockInput: AuditInput = {
    owner: 'owner',
    repo: 'repo',
    baseBranch: 'main',
    entryPoint: { kind: 'full' },
    depth: 3,
    fixMode: 'off',
    format: 'human',
    includeGraph: false,
  };

  it('does not double-count findings from overlapping graphs', async () => {
    const sharedPRNode: GraphNode = {
      ref: { kind: 'pr' as const, id: '42' },
      data: { labels: [] },
      edges: [],
    };

    const issueNode1: GraphNode = {
      ref: { kind: 'issue' as const, id: '10' },
      data: { labels: [{ name: 'fleet' }] },
      edges: [],
    };

    const issueNode2: GraphNode = {
      ref: { kind: 'issue' as const, id: '20' },
      data: { labels: [{ name: 'fleet' }] },
      edges: [],
    };

    // Graph from entry #10 contains issue:10 and pr:42
    const graph1 = {
      nodes: new Map([
        ['issue:10', issueNode1],
        ['pr:42', sharedPRNode],
      ]),
      root: { kind: 'issue' as const, id: '10' },
      unresolvedEdges: [],
    };

    // Graph from entry #20 also contains pr:42 (overlap)
    const graph2 = {
      nodes: new Map([
        ['issue:20', issueNode2],
        ['pr:42', sharedPRNode],
      ]),
      root: { kind: 'issue' as const, id: '20' },
      unresolvedEdges: [],
    };

    const mockedBuild = vi.mocked(buildLineage);
    mockedBuild.mockResolvedValueOnce(graph1);
    mockedBuild.mockResolvedValueOnce(graph2);

    const mockedScan = vi.mocked(scanItem);
    mockedScan.mockImplementation((node) => {
      return [
        {
          type: 'pr:missing-label' as const,
          severity: 'error' as const,
          fixability: 'deterministic' as const,
          nodeId: `${node.ref.kind}:${node.ref.id}`,
          detail: `Finding for ${node.ref.kind}:${node.ref.id}`,
          fixed: false,
        },
      ];
    });

    const result = await collectFindings(
      {} as any, // octokit not used since buildLineage is mocked
      mockInput,
      [
        { kind: 'issue', id: '10' },
        { kind: 'issue', id: '20' },
      ],
    );

    // 3 unique nodes: issue:10, issue:20, pr:42
    // NOT 4 (pr:42 counted once, not twice)
    expect(result.nodesScanned).toBe(3);
    expect(result.findings).toHaveLength(3);

    // Verify pr:42 findings appear exactly once
    const pr42Findings = result.findings.filter((f) => f.nodeId === 'pr:42');
    expect(pr42Findings).toHaveLength(1);
  });

  it('scans all nodes when no overlap exists', async () => {
    const node1: GraphNode = {
      ref: { kind: 'issue' as const, id: '10' },
      data: {},
      edges: [],
    };
    const node2: GraphNode = {
      ref: { kind: 'pr' as const, id: '42' },
      data: {},
      edges: [],
    };

    const graph1 = {
      nodes: new Map([['issue:10', node1]]),
      root: { kind: 'issue' as const, id: '10' },
      unresolvedEdges: [],
    };
    const graph2 = {
      nodes: new Map([['pr:42', node2]]),
      root: { kind: 'pr' as const, id: '42' },
      unresolvedEdges: [],
    };

    vi.mocked(buildLineage).mockResolvedValueOnce(graph1);
    vi.mocked(buildLineage).mockResolvedValueOnce(graph2);
    vi.mocked(scanItem).mockReturnValue([]);

    const result = await collectFindings(
      {} as any,
      mockInput,
      [
        { kind: 'issue', id: '10' },
        { kind: 'pr', id: '42' },
      ],
    );

    expect(result.nodesScanned).toBe(2);
  });
});
