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

export const MergeMode = z.enum(['label', 'fleet-run']);
export type MergeMode = z.infer<typeof MergeMode>;

export const MergeInputSchema = z
  .object({
    /** PR selection mode */
    mode: MergeMode.default('label'),
    /** Fleet run ID — required when mode is 'fleet-run' */
    runId: z.string().optional(),
    /** Base branch to merge into */
    baseBranch: z.string().default('main'),
    /** Use admin privileges to bypass branch protection */
    admin: z.boolean().default(false),
    /** Max seconds to wait for CI per PR */
    maxCIWaitSeconds: z.number().positive().default(600),
    /** Max re-dispatch attempts per PR on conflict */
    maxRetries: z.number().nonnegative().default(2),
    /** Max seconds to wait for re-dispatched PR to appear */
    pollTimeoutSeconds: z.number().positive().default(900),
    /** Repository owner */
    owner: z.string().min(1),
    /** Repository name */
    repo: z.string().min(1),
  })
  .refine((d) => d.mode !== 'fleet-run' || !!d.runId, {
    message: '--run-id is required when mode is fleet-run',
    path: ['runId'],
  });

export type MergeInput = z.infer<typeof MergeInputSchema>;

// ── ERROR CODES ─────────────────────────────────────────────────────

export const MergeErrorCode = z.enum([
  'NO_PRS_FOUND',
  'CI_FAILED',
  'CI_TIMEOUT',
  'MERGE_FAILED',
  'CONFLICT_RETRIES_EXHAUSTED',
  'REDISPATCH_TIMEOUT',
  'GITHUB_API_ERROR',
  'UNKNOWN_ERROR',
]);
export type MergeErrorCode = z.infer<typeof MergeErrorCode>;

// ── RESULT ──────────────────────────────────────────────────────────

export interface MergeSuccess {
  success: true;
  data: {
    /** PRs that were successfully merged */
    merged: number[];
    /** PRs skipped (CI failure, etc.) */
    skipped: number[];
    /** PRs that were re-dispatched due to conflicts */
    redispatched: Array<{ oldPr: number; newPr: number }>;
  };
}

export interface MergeFailure {
  success: false;
  error: {
    code: MergeErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}

export type MergeResult = MergeSuccess | MergeFailure;

// ── INTERFACE ───────────────────────────────────────────────────────

export interface MergeSpec {
  execute(input: MergeInput): Promise<MergeResult>;
}
