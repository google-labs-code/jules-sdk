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
import type { AuditInput } from '../spec.js';
import type { AuditFinding } from '../findings.js';
import type { NodeRef, LineageGraph } from '../graph/types.js';
import { buildLineage } from '../graph/build-lineage.js';
import { scanItem } from '../ops/scan-item.js';

/** Output of the collect phase. */
export interface CollectResult {
  findings: AuditFinding[];
  graphs: LineageGraph[];
  nodesScanned: number;
  totalUnresolved: number;
}

/**
 * Steps 2+3: Build lineage graphs and scan all nodes for findings.
 */
export async function collectFindings(
  octokit: Octokit,
  input: AuditInput,
  entryPoints: NodeRef[],
): Promise<CollectResult> {
  const findings: AuditFinding[] = [];
  const graphs: LineageGraph[] = [];
  let nodesScanned = 0;
  let totalUnresolved = 0;

  for (const entry of entryPoints) {
    const graph = await buildLineage(
      { octokit },
      input.owner,
      input.repo,
      entry,
      { depth: input.depth },
    );

    totalUnresolved += graph.unresolvedEdges.length;

    // Collect graph for serialization
    if (input.includeGraph) {
      graphs.push(graph);
    }

    // Scan each node
    for (const node of graph.nodes.values()) {
      const nodeFindings = scanItem(node, graph.unresolvedEdges);
      findings.push(...nodeFindings);
      nodesScanned++;
    }
  }

  return { findings, graphs, nodesScanned, totalUnresolved };
}
