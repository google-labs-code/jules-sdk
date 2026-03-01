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

// ── INPUT ───────────────────────────────────────────────────────────

export const ConflictEscalationInputSchema = z.object({
  /** Repository owner */
  owner: z.string().min(1),
  /** Repository name */
  repo: z.string().min(1),
  /** Pull request number to check for escalation */
  prNumber: z.number().int().positive(),
  /** Base branch name */
  baseBranch: z.string().default('main'),
  /** Number of consecutive conflict-detection failures before escalating */
  failureThreshold: z.number().int().positive().default(3),
});
export type ConflictEscalationInput = z.infer<typeof ConflictEscalationInputSchema>;

// ── ERROR CODES ─────────────────────────────────────────────────────

export const ConflictEscalationErrorCode = z.enum([
  'BELOW_THRESHOLD',
  'NO_CONFLICT_RUNS',
  'CHECK_RUNS_API_ERROR',
  'SESSION_DISPATCH_FAILED',
  'UNKNOWN_ERROR',
]);
export type ConflictEscalationErrorCode = z.infer<typeof ConflictEscalationErrorCode>;

// ── RESULT ──────────────────────────────────────────────────────────

export interface ConflictEscalationData {
  /** The newly dispatched Jules session ID */
  sessionId: string;
  /** How many conflict-detection failures were found */
  failureCount: number;
  /** File paths with conflicts (from the check-conflicts output) */
  conflictFiles: string[];
}

export interface ConflictEscalationSuccess {
  success: true;
  data: ConflictEscalationData;
}

export interface ConflictEscalationFailure {
  success: false;
  error: {
    code: ConflictEscalationErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}

export type ConflictEscalationResult =
  | ConflictEscalationSuccess
  | ConflictEscalationFailure;

// ── INTERFACE ───────────────────────────────────────────────────────

export interface ConflictEscalationSpec {
  execute(input: ConflictEscalationInput): Promise<ConflictEscalationResult>;
}
