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

export const DispatchInputSchema = z.object({
  /** Milestone ID to scope dispatch */
  milestone: z.string().min(1),
  /** Repository owner */
  owner: z.string().min(1),
  /** Repository name */
  repo: z.string().min(1),
  /** Base branch for Jules sessions */
  baseBranch: z.string().default('main'),
});

export type DispatchInput = z.infer<typeof DispatchInputSchema>;

// ── ERROR CODES ─────────────────────────────────────────────────────

export const DispatchErrorCode = z.enum([
  'NO_FLEET_ISSUES',
  'MILESTONE_FETCH_FAILED',
  'SESSION_DISPATCH_FAILED',
  'UNKNOWN_ERROR',
]);
export type DispatchErrorCode = z.infer<typeof DispatchErrorCode>;

// ── RESULT ──────────────────────────────────────────────────────────

export interface DispatchSuccess {
  success: true;
  data: {
    dispatched: Array<{ issueNumber: number; sessionId: string }>;
    skipped: number;
  };
}

export interface DispatchFailure {
  success: false;
  error: {
    code: DispatchErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}

export type DispatchResult = DispatchSuccess | DispatchFailure;

// ── INTERFACE ───────────────────────────────────────────────────────

export interface DispatchSpec {
  execute(input: DispatchInput): Promise<DispatchResult>;
}
