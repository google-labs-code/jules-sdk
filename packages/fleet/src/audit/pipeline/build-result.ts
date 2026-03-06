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

import type { AuditInput, AuditResult } from '../spec.js';
import type { AuditFinding } from '../findings.js';
import type { LineageGraph } from '../graph/types.js';
import { serializeGraph, mergeSerializedGraphs, embedFindings } from '../graph/serialize.js';

/** Stats collected during the audit pipeline. */
export interface AuditStats {
  nodesScanned: number;
  totalUnresolved: number;
  fixedCount: number;
  mutatedUrls: string[];
}

/**
 * Step 5: Assemble the final AuditResult from collected data.
 *
 * When includeGraph is true, findings are embedded on graph nodes
 * and the top-level findings array is empty.
 */
export function buildResult(
  input: AuditInput,
  findings: AuditFinding[],
  graphs: LineageGraph[],
  stats: AuditStats,
): AuditResult {
  if (input.includeGraph) {
    const serialized = mergeSerializedGraphs(graphs.map(serializeGraph));
    const graphWithFindings = embedFindings(serialized, findings);

    return {
      success: true,
      data: {
        findings: [], // findings are embedded in graph nodes
        fixedCount: stats.fixedCount,
        totalFindings: findings.length,
        nodesScanned: stats.nodesScanned,
        unresolvedEdges: stats.totalUnresolved,
        mutatedUrls: stats.mutatedUrls,
        graph: graphWithFindings,
      },
    };
  }

  return {
    success: true,
    data: {
      findings,
      fixedCount: stats.fixedCount,
      totalFindings: findings.length,
      nodesScanned: stats.nodesScanned,
      unresolvedEdges: stats.totalUnresolved,
      mutatedUrls: stats.mutatedUrls,
    },
  };
}

/**
 * Build an error result from a caught exception.
 */
export function buildErrorResult(error: unknown): AuditResult {
  return {
    success: false,
    error: {
      code: 'GITHUB_API_ERROR',
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
    },
  };
}
