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

import type { AuditFinding } from '../../audit/findings.js';
import type { SerializedGraph } from '../../audit/graph/serialize.js';

const severityRank = { error: 2, warning: 1, info: 0 } as const;

export interface FilterOptions {
  fixable: boolean;
  severity?: string;
}

/**
 * Test whether a finding matches the active filters.
 */
export function matchesFilter(f: AuditFinding, opts: FilterOptions): boolean {
  if (opts.fixable && f.fixability === 'none') return false;
  if (opts.severity) {
    const min = opts.severity as keyof typeof severityRank;
    if (severityRank[f.severity] < severityRank[min]) return false;
  }
  return true;
}

/**
 * Filter a flat array of findings.
 */
export function filterFindings(findings: AuditFinding[], opts: FilterOptions): AuditFinding[] {
  return findings.filter((f) => matchesFilter(f, opts));
}

/**
 * Filter findings embedded on graph nodes.
 * Returns a new graph (does not mutate input).
 */
export function filterGraphFindings(
  graph: SerializedGraph,
  opts: FilterOptions,
): SerializedGraph {
  if (!opts.fixable && !opts.severity) return graph;

  const filteredNodes: Record<string, any> = {};
  for (const [key, node] of Object.entries(graph.nodes)) {
    const nodeFindings = node.findings?.filter((f: AuditFinding) => matchesFilter(f, opts));
    filteredNodes[key] = { ...node, findings: nodeFindings };
  }
  return { ...graph, nodes: filteredNodes };
}
