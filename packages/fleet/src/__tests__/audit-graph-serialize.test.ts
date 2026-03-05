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
import {
  serializeGraph,
  mergeSerializedGraphs,
  type SerializedGraph,
} from '../audit/graph/serialize.js';
import type {
  LineageGraph,
  GraphNode,
  GraphEdge,
  EdgeRelation,
  UnresolvedEdge,
  NodeRef,
} from '../audit/graph/types.js';
import { nodeKey } from '../audit/graph/types.js';
import { AuditHandler } from '../audit/handler.js';
import { AuditInputSchema } from '../audit/spec.js';

// ── HELPERS ────────────────────────────────────────────────────────

function makeNode(ref: NodeRef, data: Record<string, unknown> = {}, edges: GraphEdge[] = []): GraphNode {
  return { ref, edges, data };
}

function makeEdge(relation: EdgeRelation, target: NodeRef, resolved = true): GraphEdge {
  return { relation, target, resolved };
}

function makeUnresolved(from: NodeRef, expectedRelation: EdgeRelation, reason: string): UnresolvedEdge {
  return { from, expectedRelation, reason };
}

function makeGraph(root: NodeRef, nodes: Map<string, GraphNode>, unresolvedEdges: UnresolvedEdge[] = []): LineageGraph {
  return { root, nodes, unresolvedEdges };
}

// ── serializeGraph ─────────────────────────────────────────────────

describe('serializeGraph', () => {
  it('serializes a single-node graph', () => {
    const root: NodeRef = { kind: 'issue', id: '42' };
    const nodes = new Map<string, GraphNode>();
    nodes.set(nodeKey(root), makeNode(root, { title: 'Test Issue', state: 'open' }));

    const result = serializeGraph(makeGraph(root, nodes));

    expect(result.root).toBe('issue:42');
    expect(result.stats.totalNodes).toBe(1);
    expect(result.stats.totalEdges).toBe(0);
    expect(result.stats.totalUnresolved).toBe(0);
    expect(result.nodes['issue:42']).toBeDefined();
    expect(result.nodes['issue:42'].kind).toBe('issue');
    expect(result.nodes['issue:42'].id).toBe('42');
    expect(result.nodes['issue:42'].title).toBe('Test Issue');
    expect(result.nodes['issue:42'].state).toBe('open');
  });

  it('serializes edges with relation, target, resolved', () => {
    const issue: NodeRef = { kind: 'issue', id: '42' };
    const pr: NodeRef = { kind: 'pr', id: '99' };
    const nodes = new Map<string, GraphNode>();
    nodes.set(nodeKey(issue), makeNode(issue, { title: 'Issue' }, [
      makeEdge('fixes', pr, true),
    ]));
    nodes.set(nodeKey(pr), makeNode(pr, { title: 'PR' }, [
      makeEdge('fixes', issue, true),
    ]));

    const result = serializeGraph(makeGraph(issue, nodes));

    expect(result.nodes['issue:42'].edges).toHaveLength(1);
    expect(result.nodes['issue:42'].edges[0]).toEqual({
      relation: 'fixes',
      target: 'pr:99',
      resolved: true,
    });
    expect(result.stats.totalEdges).toBe(2);
  });

  it('serializes unresolved edges', () => {
    const issue: NodeRef = { kind: 'issue', id: '10' };
    const nodes = new Map<string, GraphNode>();
    nodes.set(nodeKey(issue), makeNode(issue));

    const unresolved = [makeUnresolved(issue, 'dispatched', 'No Fleet Context footer')];
    const result = serializeGraph(makeGraph(issue, nodes, unresolved));

    expect(result.unresolvedEdges).toHaveLength(1);
    expect(result.unresolvedEdges[0]).toEqual({
      from: 'issue:10',
      expectedRelation: 'dispatched',
      reason: 'No Fleet Context footer',
    });
    expect(result.stats.totalUnresolved).toBe(1);
  });

  it('extracts labels from node data', () => {
    const issue: NodeRef = { kind: 'issue', id: '5' };
    const nodes = new Map<string, GraphNode>();
    nodes.set(nodeKey(issue), makeNode(issue, {
      title: 'Labeled Issue',
      labels: [{ name: 'fleet' }, { name: 'bug' }],
    }));

    const result = serializeGraph(makeGraph(issue, nodes));
    expect(result.nodes['issue:5'].labels).toEqual(['fleet', 'bug']);
  });

  it('handles string labels', () => {
    const issue: NodeRef = { kind: 'issue', id: '6' };
    const nodes = new Map<string, GraphNode>();
    nodes.set(nodeKey(issue), makeNode(issue, {
      labels: ['fleet', 'enhancement'],
    }));

    const result = serializeGraph(makeGraph(issue, nodes));
    expect(result.nodes['issue:6'].labels).toEqual(['fleet', 'enhancement']);
  });

  it('extracts milestone title from node data', () => {
    const issue: NodeRef = { kind: 'issue', id: '7' };
    const nodes = new Map<string, GraphNode>();
    nodes.set(nodeKey(issue), makeNode(issue, {
      milestone: { title: 'v1.0', number: 1 },
    }));

    const result = serializeGraph(makeGraph(issue, nodes));
    expect(result.nodes['issue:7'].milestone).toBe('v1.0');
  });

  it('omits undefined optional fields', () => {
    const issue: NodeRef = { kind: 'issue', id: '8' };
    const nodes = new Map<string, GraphNode>();
    nodes.set(nodeKey(issue), makeNode(issue, {}));

    const result = serializeGraph(makeGraph(issue, nodes));
    expect(result.nodes['issue:8'].title).toBeUndefined();
    expect(result.nodes['issue:8'].state).toBeUndefined();
    expect(result.nodes['issue:8'].labels).toBeUndefined();
    expect(result.nodes['issue:8'].milestone).toBeUndefined();
  });

  it('is JSON.stringify safe (no circular refs, no Maps)', () => {
    const issue: NodeRef = { kind: 'issue', id: '1' };
    const pr: NodeRef = { kind: 'pr', id: '2' };
    const nodes = new Map<string, GraphNode>();
    nodes.set(nodeKey(issue), makeNode(issue, { title: 'A' }, [makeEdge('fixes', pr)]));
    nodes.set(nodeKey(pr), makeNode(pr, { title: 'B' }, [makeEdge('fixes', issue)]));

    const result = serializeGraph(makeGraph(issue, nodes));
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);

    expect(parsed.root).toBe('issue:1');
    expect(parsed.nodes['issue:1'].edges[0].target).toBe('pr:2');
    expect(parsed.stats.totalNodes).toBe(2);
  });

  it('serializes complex multi-type graph', () => {
    const issue: NodeRef = { kind: 'issue', id: '10' };
    const pr: NodeRef = { kind: 'pr', id: '20' };
    const session: NodeRef = { kind: 'session', id: 's-abc' };
    const milestone: NodeRef = { kind: 'milestone', id: '1' };
    const check: NodeRef = { kind: 'check-run', id: '999' };

    const nodes = new Map<string, GraphNode>();
    nodes.set(nodeKey(issue), makeNode(issue, { title: 'Issue' }, [
      makeEdge('fixes', pr),
      makeEdge('belongs-to', milestone),
    ]));
    nodes.set(nodeKey(pr), makeNode(pr, { title: 'PR' }, [
      makeEdge('fixes', issue),
      makeEdge('has-check', check),
      makeEdge('dispatched', session),
    ]));
    nodes.set(nodeKey(session), makeNode(session, { title: 'Session' }));
    nodes.set(nodeKey(milestone), makeNode(milestone, { title: 'v1.0' }));
    nodes.set(nodeKey(check), makeNode(check, { title: 'CI' }));

    const result = serializeGraph(makeGraph(issue, nodes));

    expect(result.stats.totalNodes).toBe(5);
    expect(result.stats.totalEdges).toBe(5);
    expect(Object.keys(result.nodes)).toHaveLength(5);
    expect(result.nodes['pr:20'].edges).toHaveLength(3);
  });
});

// ── mergeSerializedGraphs ──────────────────────────────────────────

describe('mergeSerializedGraphs', () => {
  it('returns empty graph for empty array', () => {
    const result = mergeSerializedGraphs([]);
    expect(result.root).toBe('');
    expect(Object.keys(result.nodes)).toHaveLength(0);
    expect(result.stats.totalNodes).toBe(0);
  });

  it('returns the single graph unchanged for length-1 array', () => {
    const graph: SerializedGraph = {
      root: 'issue:1',
      nodes: { 'issue:1': { kind: 'issue', id: '1', edges: [] } },
      unresolvedEdges: [],
      stats: { totalNodes: 1, totalEdges: 0, totalUnresolved: 0 },
    };
    const result = mergeSerializedGraphs([graph]);
    expect(result).toEqual(graph);
  });

  it('merges non-overlapping graphs', () => {
    const g1: SerializedGraph = {
      root: 'issue:1',
      nodes: { 'issue:1': { kind: 'issue', id: '1', edges: [] } },
      unresolvedEdges: [],
      stats: { totalNodes: 1, totalEdges: 0, totalUnresolved: 0 },
    };
    const g2: SerializedGraph = {
      root: 'issue:2',
      nodes: { 'issue:2': { kind: 'issue', id: '2', edges: [] } },
      unresolvedEdges: [],
      stats: { totalNodes: 1, totalEdges: 0, totalUnresolved: 0 },
    };

    const result = mergeSerializedGraphs([g1, g2]);
    expect(result.root).toBe('issue:1'); // first graph's root
    expect(Object.keys(result.nodes)).toHaveLength(2);
    expect(result.stats.totalNodes).toBe(2);
  });

  it('deduplicates overlapping nodes (keeps first)', () => {
    const g1: SerializedGraph = {
      root: 'issue:1',
      nodes: {
        'issue:1': { kind: 'issue', id: '1', title: 'First', edges: [] },
        'milestone:1': { kind: 'milestone', id: '1', edges: [] },
      },
      unresolvedEdges: [],
      stats: { totalNodes: 2, totalEdges: 0, totalUnresolved: 0 },
    };
    const g2: SerializedGraph = {
      root: 'issue:2',
      nodes: {
        'issue:2': { kind: 'issue', id: '2', edges: [] },
        'milestone:1': { kind: 'milestone', id: '1', title: 'Second', edges: [] },
      },
      unresolvedEdges: [],
      stats: { totalNodes: 2, totalEdges: 0, totalUnresolved: 0 },
    };

    const result = mergeSerializedGraphs([g1, g2]);
    expect(Object.keys(result.nodes)).toHaveLength(3); // issue:1, milestone:1, issue:2
    // First graph's version wins
    expect(result.nodes['milestone:1'].title).toBe(undefined); // g1 had no title
  });

  it('deduplicates unresolved edges', () => {
    const g1: SerializedGraph = {
      root: 'issue:1',
      nodes: { 'issue:1': { kind: 'issue', id: '1', edges: [] } },
      unresolvedEdges: [
        { from: 'issue:1', expectedRelation: 'dispatched', reason: 'No footer' },
      ],
      stats: { totalNodes: 1, totalEdges: 0, totalUnresolved: 1 },
    };
    const g2: SerializedGraph = {
      root: 'issue:2',
      nodes: { 'issue:2': { kind: 'issue', id: '2', edges: [] } },
      unresolvedEdges: [
        { from: 'issue:1', expectedRelation: 'dispatched', reason: 'No footer' }, // dup
        { from: 'issue:2', expectedRelation: 'dispatched', reason: 'No footer' },
      ],
      stats: { totalNodes: 1, totalEdges: 0, totalUnresolved: 2 },
    };

    const result = mergeSerializedGraphs([g1, g2]);
    expect(result.unresolvedEdges).toHaveLength(2); // deduped
    expect(result.stats.totalUnresolved).toBe(2);
  });

  it('recomputes stats after merge', () => {
    const g1: SerializedGraph = {
      root: 'issue:1',
      nodes: {
        'issue:1': {
          kind: 'issue', id: '1',
          edges: [{ relation: 'fixes', target: 'pr:10', resolved: true }],
        },
      },
      unresolvedEdges: [],
      stats: { totalNodes: 1, totalEdges: 1, totalUnresolved: 0 },
    };
    const g2: SerializedGraph = {
      root: 'issue:2',
      nodes: {
        'issue:2': {
          kind: 'issue', id: '2',
          edges: [
            { relation: 'fixes', target: 'pr:20', resolved: true },
            { relation: 'belongs-to', target: 'milestone:1', resolved: true },
          ],
        },
      },
      unresolvedEdges: [
        { from: 'issue:2', expectedRelation: 'dispatched', reason: 'No footer' },
      ],
      stats: { totalNodes: 1, totalEdges: 2, totalUnresolved: 1 },
    };

    const result = mergeSerializedGraphs([g1, g2]);
    expect(result.stats.totalNodes).toBe(2);
    expect(result.stats.totalEdges).toBe(3);
    expect(result.stats.totalUnresolved).toBe(1);
  });
});

// ── embedFindings ──────────────────────────────────────────────────

import { embedFindings } from '../audit/graph/serialize.js';
import type { AuditFinding } from '../audit/findings.js';

describe('embedFindings', () => {
  const baseGraph: SerializedGraph = {
    root: 'issue:1',
    nodes: {
      'issue:1': { kind: 'issue', id: '1', title: 'Issue 1', edges: [] },
      'pr:2': { kind: 'pr', id: '2', title: 'PR 2', edges: [] },
    },
    unresolvedEdges: [],
    stats: { totalNodes: 2, totalEdges: 0, totalUnresolved: 0 },
  };

  it('embeds findings on matching nodes', () => {
    const findings: AuditFinding[] = [
      {
        type: 'issue:missing-milestone',
        severity: 'warning',
        fixability: 'cognitive',
        nodeId: 'issue:1',
        detail: 'No milestone',
        fixed: false,
      },
    ];

    const result = embedFindings(baseGraph, findings);
    expect(result.nodes['issue:1'].findings).toHaveLength(1);
    expect(result.nodes['issue:1'].findings![0].type).toBe('issue:missing-milestone');
    expect(result.nodes['pr:2'].findings).toHaveLength(0);
  });

  it('strips graph:broken-link findings', () => {
    const findings: AuditFinding[] = [
      {
        type: 'graph:broken-link',
        severity: 'warning',
        fixability: 'cognitive',
        nodeId: 'issue:1',
        detail: 'Broken link',
        fixed: false,
      },
      {
        type: 'issue:missing-source',
        severity: 'info',
        fixability: 'none',
        nodeId: 'issue:1',
        detail: 'No footer',
        fixed: false,
      },
    ];

    const result = embedFindings(baseGraph, findings);
    // graph:broken-link should be stripped
    expect(result.nodes['issue:1'].findings).toHaveLength(1);
    expect(result.nodes['issue:1'].findings![0].type).toBe('issue:missing-source');
    expect(result.stats.totalFindings).toBe(1);
  });

  it('updates stats with finding counts', () => {
    const findings: AuditFinding[] = [
      {
        type: 'issue:missing-milestone',
        severity: 'warning',
        fixability: 'cognitive',
        nodeId: 'issue:1',
        detail: 'No milestone',
        fixed: false,
      },
      {
        type: 'pr:missing-label',
        severity: 'warning',
        fixability: 'deterministic',
        nodeId: 'pr:2',
        detail: 'No label',
        fixed: true,
      },
    ];

    const result = embedFindings(baseGraph, findings);
    expect(result.stats.totalFindings).toBe(2);
    expect(result.stats.fixedCount).toBe(1);
  });

  it('handles empty findings array', () => {
    const result = embedFindings(baseGraph, []);
    expect(result.nodes['issue:1'].findings).toHaveLength(0);
    expect(result.stats.totalFindings).toBe(0);
    expect(result.stats.fixedCount).toBe(0);
  });

  it('does not mutate the original graph', () => {
    const findings: AuditFinding[] = [
      {
        type: 'issue:missing-milestone',
        severity: 'warning',
        fixability: 'cognitive',
        nodeId: 'issue:1',
        detail: 'No milestone',
        fixed: false,
      },
    ];

    embedFindings(baseGraph, findings);
    expect(baseGraph.nodes['issue:1'].findings).toBeUndefined();
  });
});

describe('AuditInputSchema includeGraph', () => {
  it('defaults includeGraph to false', () => {
    const result = AuditInputSchema.parse({
      owner: 'test',
      repo: 'repo',
    });
    expect(result.includeGraph).toBe(false);
  });

  it('accepts includeGraph: true', () => {
    const result = AuditInputSchema.parse({
      owner: 'test',
      repo: 'repo',
      includeGraph: true,
    });
    expect(result.includeGraph).toBe(true);
  });
});

// ── AuditHandler with includeGraph ─────────────────────────────────

describe('AuditHandler includeGraph integration', () => {
  const mockOctokit = {
    rest: {
      issues: {
        get: vi.fn().mockResolvedValue({
          data: {
            number: 10,
            title: 'Fleet issue',
            state: 'open',
            body: '',
            labels: [{ name: 'fleet' }],
            milestone: null,
            pull_request: undefined,
          },
        }),
        listForRepo: vi.fn().mockResolvedValue({
          data: [
            {
              number: 10,
              title: 'Fleet issue',
              state: 'open',
              body: '',
              labels: [{ name: 'fleet' }],
              milestone: null,
              pull_request: undefined,
            },
          ],
        }),
        listEventsForTimeline: vi.fn().mockResolvedValue({ data: [] }),
      },
    },
    graphql: vi.fn().mockResolvedValue({
      repository: {
        pullRequest: {
          closingIssuesReferences: { nodes: [] },
        },
      },
    }),
  } as any;

  it('omits graph when includeGraph is false', async () => {
    const handler = new AuditHandler({ octokit: mockOctokit });
    const result = await handler.execute({
      owner: 'test',
      repo: 'repo',
      baseBranch: 'main',
      entryPoint: { kind: 'issue', id: '10' },
      fix: false,
      depth: 0,
      format: 'json',
      includeGraph: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.graph).toBeUndefined();
    }
  });

  it('includes graph when includeGraph is true', async () => {
    const handler = new AuditHandler({ octokit: mockOctokit });
    const result = await handler.execute({
      owner: 'test',
      repo: 'repo',
      baseBranch: 'main',
      entryPoint: { kind: 'issue', id: '10' },
      fix: false,
      depth: 0,
      format: 'json',
      includeGraph: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.graph).toBeDefined();
      expect(result.data.graph!.root).toBe('issue:10');
      expect(result.data.graph!.nodes['issue:10']).toBeDefined();
      expect(result.data.graph!.nodes['issue:10'].kind).toBe('issue');
      expect(result.data.graph!.stats.totalNodes).toBeGreaterThan(0);
    }
  });

  it('graph output is JSON.stringify safe', async () => {
    const handler = new AuditHandler({ octokit: mockOctokit });
    const result = await handler.execute({
      owner: 'test',
      repo: 'repo',
      baseBranch: 'main',
      entryPoint: { kind: 'issue', id: '10' },
      fix: false,
      depth: 0,
      format: 'json',
      includeGraph: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const json = JSON.stringify(result.data);
      const parsed = JSON.parse(json);
      expect(parsed.graph.root).toBe('issue:10');
      expect(parsed.graph.stats.totalNodes).toBeGreaterThan(0);
    }
  });

  it('graph contains node data fields', async () => {
    const handler = new AuditHandler({ octokit: mockOctokit });
    const result = await handler.execute({
      owner: 'test',
      repo: 'repo',
      baseBranch: 'main',
      entryPoint: { kind: 'issue', id: '10' },
      fix: false,
      depth: 0,
      format: 'json',
      includeGraph: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const node = result.data.graph!.nodes['issue:10'];
      expect(node.title).toBe('Fleet issue');
      expect(node.state).toBe('open');
      expect(node.labels).toEqual(['fleet']);
    }
  });
});
