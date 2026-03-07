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

// ── AUTH MODE ───────────────────────────────────────────────────────

export const AuthModeSchema = z.enum(['token', 'app']).default('token');
export type AuthMode = z.infer<typeof AuthModeSchema>;

// ── INPUT ───────────────────────────────────────────────────────────

export const VisibilitySchema = z.enum(['public', 'private']).default('private');
export type Visibility = z.infer<typeof VisibilitySchema>;

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
  /** Feature flags — which workflows to install. Defaults to all enabled. */
  features: z.record(z.string(), z.boolean()).optional(),
  /** Pipeline cadence in minutes (min 5 per GitHub Actions, default 360 = 6h) */
  intervalMinutes: z.number().min(5).default(360),
  /** Auth mode: 'token' uses secrets.GITHUB_TOKEN, 'app' generates a GitHub App token */
  auth: AuthModeSchema,
  /** Whether to create the repo if it doesn't exist */
  createRepo: z.boolean().default(false),
  /** Repo visibility when creating (default: private) */
  visibility: VisibilitySchema,
  /** Repo description when creating */
  description: z.string().optional(),
});

export type InitInput = z.infer<typeof InitInputSchema>;

// ── ERROR CODES ─────────────────────────────────────────────────────

export const InitErrorCode = z.enum([
  'REPO_NOT_FOUND',
  'REPO_CREATE_FAILED',
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
    /** Whether the repo was created as part of init */
    repoCreated?: boolean;
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
