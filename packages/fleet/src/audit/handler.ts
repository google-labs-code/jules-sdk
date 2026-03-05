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
import type { AuditInput, AuditResult, AuditSpec } from './spec.js';
import type { AuditFinding } from './findings.js';
import { parseNodeId } from './findings.js';
import type { NodeRef } from './graph/types.js';
import { buildLineage } from './graph/build-lineage.js';
import { scanItem } from './ops/scan-item.js';
import { addLabel } from './ops/add-label.js';
import { assignMilestone } from './ops/assign-milestone.js';
import { listUndispatchedIssues } from './ops/list-undispatched-issues.js';

export interface AuditHandlerDeps {
  octokit: Octokit;
}

/**
 * AuditHandler orchestrates the full audit pipeline:
 * 1. Determine entry point(s)
 * 2. Build lineage graph for each
 * 3. Scan all nodes for findings
 * 4. Optionally fix deterministic findings
 */
export class AuditHandler implements AuditSpec {
  private readonly octokit: Octokit;

  constructor(deps: AuditHandlerDeps) {
    this.octokit = deps.octokit;
  }

  async execute(input: AuditInput): Promise<AuditResult> {
    try {
      const allFindings: AuditFinding[] = [];
      let nodesScanned = 0;
      let totalUnresolved = 0;

      // 1. Determine entry points
      const entryPoints = await this.resolveEntryPoints(input);

      // 2. For each entry point, build lineage and scan
      for (const entry of entryPoints) {
        const graph = await buildLineage(
          { octokit: this.octokit },
          input.owner,
          input.repo,
          entry,
          { depth: input.depth },
        );

        totalUnresolved += graph.unresolvedEdges.length;

        // 3. Scan each node
        for (const node of graph.nodes.values()) {
          const findings = scanItem(node, graph.unresolvedEdges);
          allFindings.push(...findings);
          nodesScanned++;
        }
      }

      // 4. Auto-fix deterministic findings if requested
      let fixedCount = 0;
      if (input.fix) {
        fixedCount = await this.applyFixes(input, allFindings);
      }

      return {
        success: true,
        data: {
          findings: allFindings,
          fixedCount,
          totalFindings: allFindings.length,
          nodesScanned,
          unresolvedEdges: totalUnresolved,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GITHUB_API_ERROR',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        },
      };
    }
  }

  private async resolveEntryPoints(input: AuditInput): Promise<NodeRef[]> {
    const ep = input.entryPoint;

    switch (ep.kind) {
      case 'issue':
        return [{ kind: 'issue', id: ep.id }];
      case 'pr':
        return [{ kind: 'pr', id: ep.id }];
      case 'milestone':
        return [{ kind: 'milestone', id: ep.id }];
      case 'full': {
        // For full scan, start from undispatched issues
        const undispatched = await listUndispatchedIssues(
          this.octokit,
          input.owner,
          input.repo,
        );
        return undispatched.map((i) => ({
          kind: 'issue' as const,
          id: String(i.number),
        }));
      }
    }
  }

  private async applyFixes(
    input: AuditInput,
    findings: AuditFinding[],
  ): Promise<number> {
    let fixedCount = 0;

    for (const finding of findings) {
      if (finding.fixability !== 'deterministic' || finding.fixed) continue;

      try {
        switch (finding.type) {
          case 'pr:missing-label': {
            const parsed = parseNodeId(finding.nodeId);
            if (!parsed) break;
            await addLabel(
              this.octokit,
              input.owner,
              input.repo,
              Number(parsed.id),
              'fleet-merge-ready',
            );
            finding.fixed = true;
            fixedCount++;
            break;
          }
          // Other deterministic fixes can be added here
          default:
            break;
        }
      } catch {
        // Log but continue — one fix failure shouldn't stop others
      }
    }

    return fixedCount;
  }
}
