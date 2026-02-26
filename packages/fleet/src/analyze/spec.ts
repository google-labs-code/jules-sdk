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

export const AnalyzeInputSchema = z.object({
  /** Path to a specific goal file */
  goal: z.string().optional(),
  /** Directory to auto-discover goal files from */
  goalsDir: z.string().default('.fleet/goals'),
  /** Milestone ID to scope context */
  milestone: z.string().optional(),
  /** Repository owner */
  owner: z.string().min(1),
  /** Repository name */
  repo: z.string().min(1),
  /** Base branch for Jules sessions */
  baseBranch: z.string().default('main'),
});

export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;

// ── ERROR CODES ─────────────────────────────────────────────────────

export const AnalyzeErrorCode = z.enum([
  'GOAL_NOT_FOUND',
  'NO_GOALS_FOUND',
  'MILESTONE_FETCH_FAILED',
  'SESSION_DISPATCH_FAILED',
  'UNKNOWN_ERROR',
]);
export type AnalyzeErrorCode = z.infer<typeof AnalyzeErrorCode>;

// ── RESULT ──────────────────────────────────────────────────────────

export interface AnalyzeSuccess {
  success: true;
  data: {
    sessionsStarted: Array<{ goal: string; sessionId: string }>;
  };
}

export interface AnalyzeFailure {
  success: false;
  error: {
    code: AnalyzeErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}

export type AnalyzeResult = AnalyzeSuccess | AnalyzeFailure;

// ── INTERFACE ───────────────────────────────────────────────────────

export interface AnalyzeSpec {
  execute(input: AnalyzeInput): Promise<AnalyzeResult>;
}
