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

// ── Spec ───────────────────────────────────────────────────────────
export {
  AuditInputSchema,
  AuditErrorCode,
  type AuditInput,
  type AuditSuccess,
  type AuditFailure,
  type AuditResult,
  type AuditSpec,
} from './spec.js';

// ── Finding Types ──────────────────────────────────────────────────
export {
  parseNodeId,
  type AuditFinding,
  type AuditFindingType,
  type AuditFindingSeverity,
  type AuditFixability,
} from './findings.js';

// ── Handler ────────────────────────────────────────────────────────
export { AuditHandler } from './handler.js';

// ── Graph Types ────────────────────────────────────────────────────
export {
  nodeKey,
  type NodeKind,
  type NodeRef,
  type GraphNode,
  type GraphEdge,
  type EdgeRelation,
  type UnresolvedEdge,
  type LineageGraph,
} from './graph/types.js';

// ── Graph Builder ──────────────────────────────────────────────────
export { buildLineage, type BuildLineageDeps, type BuildLineageOptions } from './graph/build-lineage.js';

export {
  scanItem,
} from './ops/scan-item.js';

export {
  listUndispatchedIssues,
  type UndispatchedIssue,
} from './ops/list-undispatched-issues.js';

// ── Edge Resolution Ops ────────────────────────────────────────────
export { resolvePRToIssues } from './ops/resolve-pr-to-issues.js';
export { resolveIssueToPRs } from './ops/resolve-issue-to-prs.js';
export { resolveIssueToSession } from './ops/resolve-issue-to-session.js';
export { resolvePRToSession } from './ops/resolve-pr-to-session.js';
export { resolveSessionToPR } from './ops/resolve-session-to-pr.js';
export { resolvePRToChecks } from './ops/resolve-pr-to-checks.js';
export { resolveMilestoneToItems } from './ops/resolve-milestone-to-items.js';

// ── Fix Ops ────────────────────────────────────────────────────────
export { addLabel } from './ops/add-label.js';
export { assignMilestone } from './ops/assign-milestone.js';
export { copyMilestone } from './ops/copy-milestone.js';

// ── Shared Utilities ───────────────────────────────────────────────
export { formatSourceLink } from '../shared/source-link.js';
