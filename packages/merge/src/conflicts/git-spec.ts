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

// INPUT
export const GitCheckInputSchema = z.object({
  repo: z
    .string()
    .min(1)
    .refine((s) => s.includes('/'), 'Must be in owner/repo format'),
  pullRequestNumber: z.number().int().positive(),
  failingCommitSha: z.string().min(1),
});
export type GitCheckInput = z.infer<typeof GitCheckInputSchema>;

// ERROR CODES (exhaustive)
export const GitCheckErrorCode = z.enum([
  'NO_UNMERGED_FILES',
  'GIT_STATUS_FAILED',
  'FILE_READ_FAILED',
  'UNKNOWN_ERROR',
]);
export type GitCheckErrorCode = z.infer<typeof GitCheckErrorCode>;

// SUCCESS DATA
export interface GitCheckData {
  taskDirective: string;
  priority: 'standard' | 'critical';
  affectedFiles: Array<{
    filePath: string;
    baseCommitSha: string;
    gitConflictMarkers: string;
  }>;
}

// RESULT (Discriminated Union)
export interface GitCheckSuccess {
  success: true;
  data: GitCheckData;
}
export interface GitCheckFailure {
  success: false;
  error: {
    code: GitCheckErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}
export type GitCheckResult = GitCheckSuccess | GitCheckFailure;

// INTERFACE (Capability)
export interface GitCheckSpec {
  execute(input: GitCheckInput): Promise<GitCheckResult>;
}
