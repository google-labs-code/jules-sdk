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

import type { LineageGraph, GraphNode, GraphEdge, UnresolvedEdge, NodeRef } from './types.js';
import { nodeKey } from './types.js';
import { z } from 'zod';
import { AuditFindingSchema } from '../findings.js';

// ── SERIALIZED SCHEMAS ─────────────────────────────────────────────

/** JSON-friendly serialized edge. */
export const SerializedEdgeSchema = z.object({
  relation: z.string(),
  target: z.string(), // nodeKey format: "kind:id"
  resolved: z.boolean(),
});
export type SerializedEdge = z.infer<typeof SerializedEdgeSchema>;

/** JSON-friendly serialized node with selected data fields. */
export const SerializedNodeSchema = z.object({
  kind: z.string(),
  id: z.string(),
  title: z.string().optional(),
  state: z.string().optional(),
  labels: z.array(z.string()).optional(),
  milestone: z.string().optional(),
  edges: z.array(SerializedEdgeSchema),
  /** Findings for this node — present when includeGraph is true */
  findings: z.array(AuditFindingSchema).optional(),
});
export type SerializedNode = z.infer<typeof SerializedNodeSchema>;

/** JSON-friendly serialized unresolved edge. */
export const SerializedUnresolvedEdgeSchema = z.object({
  from: z.string(), // nodeKey format
  expectedRelation: z.string(),
  reason: z.string(),
});
export type SerializedUnresolvedEdge = z.infer<typeof SerializedUnresolvedEdgeSchema>;

/** Complete serialized graph — JSON.stringify-safe. */
export const SerializedGraphSchema = z.object({
  root: z.string(), // nodeKey format
  nodes: z.record(z.string(), SerializedNodeSchema),
  unresolvedEdges: z.array(SerializedUnresolvedEdgeSchema),
  stats: z.object({
    totalNodes: z.number(),
    totalEdges: z.number(),
    totalUnresolved: z.number(),
    totalFindings: z.number().optional(),
    fixedCount: z.number().optional(),
  }),
});
export type SerializedGraph = z.infer<typeof SerializedGraphSchema>;

// ── SERIALIZER ─────────────────────────────────────────────────────

/**
 * Serialize a LineageGraph into a JSON-friendly structure.
 *
 * The Map<string, GraphNode> is converted to a plain object keyed
 * by nodeKey. Data fields are selectively extracted to keep the
 * output focused on what's useful for LLM reasoning:
 * - title, state, labels, milestone (for context)
 * - edges with relation/target/resolved (for traversal)
 */
export function serializeGraph(graph: LineageGraph): SerializedGraph {
  const nodes: Record<string, SerializedNode> = {};
  let totalEdges = 0;

  for (const [key, node] of graph.nodes) {
    nodes[key] = serializeNode(node);
    totalEdges += node.edges.length;
  }

  return {
    root: nodeKey(graph.root),
    nodes,
    unresolvedEdges: graph.unresolvedEdges.map(serializeUnresolvedEdge),
    stats: {
      totalNodes: graph.nodes.size,
      totalEdges,
      totalUnresolved: graph.unresolvedEdges.length,
    },
  };
}

/**
 * Merge multiple serialized graphs into a single combined graph.
 * Used when scanning from multiple entry points (e.g., full scan).
 */
export function mergeSerializedGraphs(graphs: SerializedGraph[]): SerializedGraph {
  if (graphs.length === 0) {
    return {
      root: '',
      nodes: {},
      unresolvedEdges: [],
      stats: { totalNodes: 0, totalEdges: 0, totalUnresolved: 0 },
    };
  }

  if (graphs.length === 1) return graphs[0];

  const merged: SerializedGraph = {
    root: graphs[0].root,
    nodes: {},
    unresolvedEdges: [],
    stats: { totalNodes: 0, totalEdges: 0, totalUnresolved: 0 },
  };

  for (const graph of graphs) {
    // Merge nodes (later graphs don't overwrite existing nodes)
    for (const [key, node] of Object.entries(graph.nodes)) {
      if (!merged.nodes[key]) {
        merged.nodes[key] = node;
      }
    }

    // Merge unresolved edges (dedup by from+relation)
    for (const edge of graph.unresolvedEdges) {
      const exists = merged.unresolvedEdges.some(
        (e) => e.from === edge.from && e.expectedRelation === edge.expectedRelation,
      );
      if (!exists) {
        merged.unresolvedEdges.push(edge);
      }
    }
  }

  // Recompute stats
  merged.stats.totalNodes = Object.keys(merged.nodes).length;
  merged.stats.totalEdges = Object.values(merged.nodes).reduce(
    (sum, node) => sum + node.edges.length, 0,
  );
  merged.stats.totalUnresolved = merged.unresolvedEdges.length;

  // Recompute finding stats from embedded node findings
  let totalFindings = 0;
  let fixedCount = 0;
  for (const node of Object.values(merged.nodes)) {
    if (node.findings) {
      totalFindings += node.findings.length;
      fixedCount += node.findings.filter((f) => f.fixed).length;
    }
  }
  if (totalFindings > 0) {
    merged.stats.totalFindings = totalFindings;
    merged.stats.fixedCount = fixedCount;
  }

  return merged;
}
// ── FINDING EMBEDDING ──────────────────────────────────────────────

/**
 * Embed findings onto their corresponding graph nodes.
 *
 * - Maps each finding to its node via `nodeId` (nodeKey format).
 * - Strips `graph:broken-link` findings (redundant with `unresolvedEdges`).
 * - Updates graph stats with finding counts.
 *
 * Returns a new graph (does not mutate the input).
 */
export function embedFindings(
  graph: SerializedGraph,
  findings: import('../findings.js').AuditFinding[],
): SerializedGraph {
  // Deep clone nodes to avoid mutating the input
  const nodes: Record<string, SerializedNode> = {};
  for (const [key, node] of Object.entries(graph.nodes)) {
    nodes[key] = { ...node, findings: [] };
  }

  // Filter out graph:broken-link — already represented in unresolvedEdges
  const relevantFindings = findings.filter(
    (f) => f.type !== 'graph:broken-link',
  );

  let fixedCount = 0;
  for (const finding of relevantFindings) {
    if (nodes[finding.nodeId]) {
      nodes[finding.nodeId].findings!.push(finding);
    }
    if (finding.fixed) fixedCount++;
  }

  return {
    ...graph,
    nodes,
    stats: {
      ...graph.stats,
      totalFindings: relevantFindings.length,
      fixedCount,
    },
  };
}

// ── HELPERS ────────────────────────────────────────────────────────

function serializeNode(node: GraphNode): SerializedNode {
  const result: SerializedNode = {
    kind: node.ref.kind,
    id: node.ref.id,
    edges: node.edges.map(serializeEdge),
  };

  // Extract useful data fields (defensive — data shape depends on node kind)
  if (node.data.title != null) result.title = String(node.data.title);
  if (node.data.state != null) result.state = String(node.data.state);
  if (Array.isArray(node.data.labels)) {
    result.labels = node.data.labels.map((l: any) =>
      typeof l === 'string' ? l : l?.name ?? '',
    ).filter(Boolean);
  }
  if (node.data.milestone != null) {
    const ms = node.data.milestone as any;
    result.milestone = ms.title ?? String(ms.number ?? ms);
  }

  return result;
}

function serializeEdge(edge: GraphEdge): SerializedEdge {
  return {
    relation: edge.relation,
    target: nodeKey(edge.target),
    resolved: edge.resolved,
  };
}

function serializeUnresolvedEdge(edge: UnresolvedEdge): SerializedUnresolvedEdge {
  return {
    from: nodeKey(edge.from),
    expectedRelation: edge.expectedRelation,
    reason: edge.reason,
  };
}
