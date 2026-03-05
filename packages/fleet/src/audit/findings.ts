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

import { z } from 'zod';

// ── FINDING TYPES ──────────────────────────────────────────────────

export const AuditFindingTypeSchema = z.enum([
  // Issue findings
  'issue:missing-label',       // fleet issue without fleet label
  'issue:missing-milestone',   // fleet issue without milestone
  'issue:undispatched',        // fleet issue with no linked PR
  'issue:missing-source',      // fleet issue without Fleet Context footer
  'issue:stale',               // fleet issue open > N days with no activity

  // PR findings
  'pr:missing-label',          // PR linked to fleet issue but missing fleet-merge-ready
  'pr:missing-milestone',      // PR missing milestone from linked issue
  'pr:orphaned',               // PR with no linked issues
  'pr:missing-session',        // jules/ PR with no session ID
  'pr:failing-checks',         // PR with failing check runs
  'pr:stale',                  // PR open > N days with no activity
  'pr:draft-with-checks',      // Draft PR with check runs (resource waste)

  // Graph integrity findings
  'graph:broken-link',         // Node with unresolved edges
  'graph:orphaned-session',    // Session with no linked issue or PR
  'graph:milestone-mismatch',  // Issue and PR in different milestones
]);
export type AuditFindingType = z.infer<typeof AuditFindingTypeSchema>;

export const AuditFindingSeveritySchema = z.enum(['error', 'warning', 'info']);
export type AuditFindingSeverity = z.infer<typeof AuditFindingSeveritySchema>;

export const AuditFixabilitySchema = z.enum(['deterministic', 'cognitive', 'none']);
export type AuditFixability = z.infer<typeof AuditFixabilitySchema>;

export const AuditFindingSchema = z.object({
  type: AuditFindingTypeSchema,
  severity: AuditFindingSeveritySchema,
  fixability: AuditFixabilitySchema,
  /** The node this finding applies to */
  nodeId: z.string(), // nodeKey format: "kind:id"
  /** Human-readable description */
  detail: z.string(),
  /** Whether this finding was auto-fixed */
  fixed: z.boolean(),
  /** Whether this finding would be fixed in apply mode (dry-run only) */
  wouldFix: z.boolean().optional(),
});
export type AuditFinding = z.infer<typeof AuditFindingSchema>;

// ── NODE ID PARSING ────────────────────────────────────────────────

/**
 * Parse a nodeId string (format: "kind:id") into its components.
 * Returns null if the format is invalid.
 */
export function parseNodeId(nodeId: string): { kind: string; id: string } | null {
  const colonIndex = nodeId.indexOf(':');
  if (colonIndex === -1 || colonIndex === 0) return null;

  const kind = nodeId.slice(0, colonIndex);
  const id = nodeId.slice(colonIndex + 1);

  if (!id) return null;

  return { kind, id };
}
