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

export const SignalKind = z.enum(['insight', 'assessment']);
export type SignalKind = z.infer<typeof SignalKind>;

export const SignalCreateInputSchema = z.object({
  /** Repository owner */
  owner: z.string().min(1),
  /** Repository name */
  repo: z.string().min(1),
  /** Signal kind: insight (informational) or assessment (actionable) */
  kind: SignalKind.default('assessment'),
  /** Signal title */
  title: z.string().min(1),
  /** Markdown body content */
  body: z.string().min(1),
  /** Tags to apply (become labels in GitHub) */
  tags: z.array(z.string()).default([]),
  /** Scope name (maps to milestone title in GitHub) */
  scope: z.string().optional(),
});

export type SignalCreateInput = z.infer<typeof SignalCreateInputSchema>;

// ── ERROR CODES ─────────────────────────────────────────────────────

export const SignalCreateErrorCode = z.enum([
  'GITHUB_API_ERROR',
  'SCOPE_NOT_FOUND',
  'UNKNOWN_ERROR',
]);
export type SignalCreateErrorCode = z.infer<typeof SignalCreateErrorCode>;

// ── RESULT ──────────────────────────────────────────────────────────

export interface SignalCreateSuccess {
  success: true;
  data: {
    /** Created signal ID (issue number in GitHub) */
    id: number;
    /** URL to the created signal */
    url: string;
  };
}

export interface SignalCreateFailure {
  success: false;
  error: {
    code: SignalCreateErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}

export type SignalCreateResult = SignalCreateSuccess | SignalCreateFailure;

// ── INTERFACE ───────────────────────────────────────────────────────

export interface SignalCreateSpec {
  execute(input: SignalCreateInput): Promise<SignalCreateResult>;
}
