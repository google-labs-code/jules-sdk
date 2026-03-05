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

// ── NODE TYPES ─────────────────────────────────────────────────────

/** Supported node kinds in the lineage graph. */
export type NodeKind =
  | 'issue'
  | 'pr'
  | 'session'
  | 'milestone'
  | 'check-run'
  | 'workflow-run'
  | 'goal';

/** Unique reference to a node in the graph. */
export interface NodeRef {
  kind: NodeKind;
  id: string; // e.g. issue number, PR number, session ID
}

/** Serialize a NodeRef to a stable map key. */
export function nodeKey(ref: NodeRef): string {
  return `${ref.kind}:${ref.id}`;
}

// ── EDGES ──────────────────────────────────────────────────────────

export type EdgeRelation =
  | 'created'      // session → issue (session created this issue)
  | 'fixes'        // pr → issue (PR fixes this issue)
  | 'produced'     // session → pr (session produced this PR)
  | 'belongs-to'   // issue/pr → milestone
  | 'has-check'    // pr → check-run
  | 'dispatched'   // issue → session (issue dispatched this session)
  | 'triggered';   // workflow-run → session

export interface GraphEdge {
  relation: EdgeRelation;
  target: NodeRef;
  resolved: boolean; // false = we know the edge should exist but can't resolve it
}

// ── NODES ──────────────────────────────────────────────────────────

export interface GraphNode {
  ref: NodeRef;
  /** Raw data from the source API (issue, PR, session, etc.) */
  data: Record<string, unknown>;
  edges: GraphEdge[];
}

// ── GRAPH ──────────────────────────────────────────────────────────

/**
 * Represents an expected but unresolvable link in the graph.
 * Distinct from "absent" (no link exists) — unresolved means
 * we expected a link but couldn't trace it.
 */
export interface UnresolvedEdge {
  from: NodeRef;
  expectedRelation: EdgeRelation;
  reason: string; // e.g. "No Fleet Context footer in issue body"
}

export interface LineageGraph {
  /** All discovered nodes, keyed by nodeKey(ref). */
  nodes: Map<string, GraphNode>;
  /** The starting point of the traversal. */
  root: NodeRef;
  /** Edges that should exist but couldn't be resolved. */
  unresolvedEdges: UnresolvedEdge[];
}
