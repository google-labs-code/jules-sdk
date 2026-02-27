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

export const InitInputSchema = z.object({
  /** Repository in owner/repo format (auto-detected from git if omitted) */
  repo: z
    .string()
    .regex(/^[^/]+\/[^/]+$/, 'Must be in owner/repo format')
    .optional(),
  /** Repository owner (resolved from repo or git) */
  owner: z.string().min(1),
  /** Repository name (resolved from repo or git) */
  repoName: z.string().min(1),
  /** Base branch for the PR */
  baseBranch: z.string().default('main'),
  /** Whether to overwrite existing workflow files */
  overwrite: z.boolean().default(false),
});

export type InitInput = z.infer<typeof InitInputSchema>;

// ── ERROR CODES ─────────────────────────────────────────────────────

export const InitErrorCode = z.enum([
  'REPO_NOT_FOUND',
  'BRANCH_CREATE_FAILED',
  'FILE_COMMIT_FAILED',
  'PR_CREATE_FAILED',
  'LABEL_CREATE_FAILED',
  'ALREADY_INITIALIZED',
  'GITHUB_API_ERROR',
  'UNKNOWN_ERROR',
]);
export type InitErrorCode = z.infer<typeof InitErrorCode>;

// ── RESULT ──────────────────────────────────────────────────────────

export interface InitSuccess {
  success: true;
  data: {
    /** URL of the created PR */
    prUrl: string;
    /** PR number */
    prNumber: number;
    /** Files committed to the branch */
    filesCreated: string[];
    /** Labels created in the repo */
    labelsCreated: string[];
  };
}

export interface InitFailure {
  success: false;
  error: {
    code: InitErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}

export type InitResult = InitSuccess | InitFailure;

// ── INTERFACE ───────────────────────────────────────────────────────

export interface InitSpec {
  execute(input: InitInput): Promise<InitResult>;
}
