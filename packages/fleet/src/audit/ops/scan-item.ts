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

import type { GraphNode, UnresolvedEdge } from '../graph/types.js';
import type { AuditFinding } from '../findings.js';
import { hasFleetContext } from '../../shared/fleet-context.js';

// Re-export finding types for convenience
export type {
  AuditFinding,
  AuditFindingType,
  AuditFindingSeverity,
  AuditFixability,
} from '../findings.js';

// ── SCANNER ────────────────────────────────────────────────────────

/**
 * Scan a single GraphNode and produce findings based on its state.
 * Deterministic — no cognitive judgment, just rule evaluation.
 */
export function scanItem(
  node: GraphNode,
  unresolvedEdges: UnresolvedEdge[],
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const labels = extractLabels(node);
  const isFleetItem = labels.some((l) => l.startsWith('fleet'));

  switch (node.ref.kind) {
    case 'issue':
      scanIssue(node, labels, isFleetItem, findings);
      break;
    case 'pr':
      scanPR(node, labels, isFleetItem, findings);
      break;
  }

  // Graph integrity: check for unresolved edges pointing from this node
  const nodeUnresolved = unresolvedEdges.filter(
    (e) => e.from.kind === node.ref.kind && e.from.id === node.ref.id,
  );
  for (const edge of nodeUnresolved) {
    findings.push({
      type: 'graph:broken-link',
      severity: 'warning',
      fixability: 'cognitive',
      nodeId: `${node.ref.kind}:${node.ref.id}`,
      detail: `Broken link: expected ${edge.expectedRelation} edge — ${edge.reason}`,
      fixed: false,
    });
  }

  return findings;
}

function scanIssue(
  node: GraphNode,
  labels: string[],
  isFleetItem: boolean,
  findings: AuditFinding[],
): void {
  if (!isFleetItem) return;

  const nodeId = `${node.ref.kind}:${node.ref.id}`;

  // Missing milestone
  if (!node.data.milestone) {
    findings.push({
      type: 'issue:missing-milestone',
      severity: 'warning',
      fixability: 'cognitive', // agent decides which milestone
      nodeId,
      detail: `Fleet issue #${node.ref.id} has no milestone`,
      fixed: false,
    });
  }

  // Missing source (no Fleet Context footer)
  const body = (node.data.body as string) ?? '';
  if (!hasFleetContext(body)) {
    findings.push({
      type: 'issue:missing-source',
      severity: 'info',
      fixability: 'none', // can't retroactively add provenance
      nodeId,
      detail: `Fleet issue #${node.ref.id} has no Fleet Context footer (no provenance)`,
      fixed: false,
    });
  }

  // Undispatched — no linked PRs
  const hasPREdge = node.edges.some(
    (e) => e.target.kind === 'pr' && e.resolved,
  );
  if (!hasPREdge) {
    findings.push({
      type: 'issue:undispatched',
      severity: 'warning',
      fixability: 'cognitive', // agent decides to dispatch
      nodeId,
      detail: `Fleet issue #${node.ref.id} has no linked PR — dispatch candidate`,
      fixed: false,
    });
  }
}

function scanPR(
  node: GraphNode,
  labels: string[],
  _isFleetItem: boolean,
  findings: AuditFinding[],
): void {
  const nodeId = `${node.ref.kind}:${node.ref.id}`;

  // Check if PR is linked to any fleet issues
  const linkedIssues = node.edges.filter(
    (e) => e.relation === 'fixes' && e.target.kind === 'issue',
  );
  const hasFleetIssueLink = linkedIssues.length > 0; // simplified — we'd check labels in full impl

  // Missing fleet-merge-ready label
  if (hasFleetIssueLink && !labels.includes('fleet-merge-ready')) {
    findings.push({
      type: 'pr:missing-label',
      severity: 'error',
      fixability: 'deterministic',
      nodeId,
      detail: `PR #${node.ref.id} fixes fleet issue(s) but is missing fleet-merge-ready label`,
      fixed: false,
    });
  }

  // Orphaned — no linked issues at all
  if (linkedIssues.length === 0) {
    const headRef = (node.data.headRef as string) ?? '';
    if (headRef.startsWith('fleet/') || headRef.startsWith('jules/')) {
      findings.push({
        type: 'pr:orphaned',
        severity: 'warning',
        fixability: 'cognitive',
        nodeId,
        detail: `PR #${node.ref.id} has no linked issues but is on a fleet/jules branch`,
        fixed: false,
      });
    }
  }

  // Missing milestone (when linked issue has one)
  if (hasFleetIssueLink && !node.data.milestone) {
    findings.push({
      type: 'pr:missing-milestone',
      severity: 'warning',
      fixability: 'deterministic',
      nodeId,
      detail: `PR #${node.ref.id} fixes fleet issue(s) but has no milestone`,
      fixed: false,
    });
  }
}

function extractLabels(node: GraphNode): string[] {
  const labels = node.data.labels;
  if (!Array.isArray(labels)) return [];
  return labels.map((l: any) =>
    typeof l === 'string' ? l : l?.name ?? '',
  ).filter(Boolean);
}
