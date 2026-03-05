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
import type { AuditFinding } from './ops/scan-item.js';

// ── INPUT ───────────────────────────────────────────────────────────

export const AuditInputSchema = z.object({
  /** Repository owner */
  owner: z.string().min(1),
  /** Repository name */
  repo: z.string().min(1),
  /** Base branch for PR queries */
  baseBranch: z.string().default('main'),
  /** Entry point — where to start the audit */
  entryPoint: z.union([
    z.object({ kind: z.literal('milestone'), id: z.string() }),
    z.object({ kind: z.literal('issue'), id: z.string() }),
    z.object({ kind: z.literal('pr'), id: z.string() }),
    z.object({ kind: z.literal('full') }), // full repo scan
  ]).default({ kind: 'full' }),
  /** Whether to auto-fix deterministic findings */
  fix: z.boolean().default(false),
  /** Max graph traversal depth */
  depth: z.number().min(0).max(5).default(2),
  /** Output format */
  format: z.enum(['human', 'json']).default('human'),
});

export type AuditInput = z.infer<typeof AuditInputSchema>;

// ── ERROR CODES ─────────────────────────────────────────────────────

export const AuditErrorCode = z.enum([
  'GITHUB_API_ERROR',
  'ENTRY_POINT_NOT_FOUND',
  'UNKNOWN_ERROR',
]);
export type AuditErrorCode = z.infer<typeof AuditErrorCode>;

// ── RESULT ──────────────────────────────────────────────────────────

export interface AuditSuccess {
  success: true;
  data: {
    findings: AuditFinding[];
    fixedCount: number;
    totalFindings: number;
    nodesScanned: number;
    unresolvedEdges: number;
  };
}

export interface AuditFailure {
  success: false;
  error: {
    code: AuditErrorCode;
    message: string;
    recoverable: boolean;
  };
}

export type AuditResult = AuditSuccess | AuditFailure;

// ── INTERFACE ───────────────────────────────────────────────────────

export interface AuditSpec {
  execute(input: AuditInput): Promise<AuditResult>;
}
