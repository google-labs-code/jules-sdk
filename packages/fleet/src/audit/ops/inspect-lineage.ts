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

import type { Octokit } from 'octokit';
import { buildLineage } from '../graph/build-lineage.js';
import { nodeKey } from '../graph/types.js';

/** Serialized lineage node for JSON output. */
export interface SerializedLineageNode {
  key: string;
  ref: { kind: string; id: string };
  edges: number;
  data: { title: unknown; state: unknown };
}

/** Serialized lineage graph for JSON output. */
export interface InspectResult {
  root: { kind: string; id: string };
  nodes: SerializedLineageNode[];
  unresolvedEdges: Array<{ from: { kind: string; id: string }; expectedRelation: string; reason: string }>;
}

/**
 * Inspect the lineage graph for a specific issue or PR.
 *
 * Returns a serializable result (no Maps or complex types) that can
 * be rendered as JSON via `renderResult` or printed in human format.
 */
export async function inspectLineage(
  octokit: Octokit,
  owner: string,
  repo: string,
  target: { kind: 'issue' | 'pr'; id: string },
  options: { depth: number } = { depth: 2 },
): Promise<InspectResult> {
  const graph = await buildLineage(
    { octokit },
    owner,
    repo,
    target,
    options,
  );

  return {
    root: graph.root,
    nodes: Array.from(graph.nodes.entries()).map(([key, node]) => ({
      key,
      ref: node.ref,
      edges: node.edges.length,
      data: { title: node.data.title, state: node.data.state },
    })),
    unresolvedEdges: graph.unresolvedEdges,
  };
}

/** Render an InspectResult as human-readable text. */
export function renderInspectHuman(result: InspectResult): string {
  const lines: string[] = [];
  lines.push(`\n🌳 Lineage Graph (root: ${result.root.kind}:${result.root.id})`);
  lines.push(`   Nodes: ${result.nodes.length}`);
  lines.push(`   Unresolved edges: ${result.unresolvedEdges.length}`);

  for (const node of result.nodes) {
    const title = (node.data.title as string) || node.ref.id;
    lines.push(`\n   ${node.key}: ${title}`);
    lines.push(`     edges: ${node.edges}`);
  }

  if (result.unresolvedEdges.length > 0) {
    lines.push(`\n   ⚠️  Unresolved Edges:`);
    for (const edge of result.unresolvedEdges) {
      lines.push(`     ${edge.from.kind}:${edge.from.id} --${edge.expectedRelation}--> ? (${edge.reason})`);
    }
  }

  return lines.join('\n');
}
