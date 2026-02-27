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

export const OverlapInputSchema = z.object({
  /** Issues with their pre-parsed target file lists */
  issues: z
    .array(
      z.object({
        /** Issue number */
        number: z.number().int().positive(),
        /** Target files extracted from Fleet Analysis Event comment */
        targetFiles: z.array(z.string().min(1)),
      }),
    )
    .min(1),
});

export type OverlapInput = z.infer<typeof OverlapInputSchema>;

// ── ERROR CODES ─────────────────────────────────────────────────────

export const OverlapErrorCode = z.enum([
  'NO_ISSUES',
  'UNKNOWN_ERROR',
]);
export type OverlapErrorCode = z.infer<typeof OverlapErrorCode>;

// ── RESULT ──────────────────────────────────────────────────────────

/** A file that appears in multiple issues */
export interface FileOverlap {
  file: string;
  issues: number[];
}

/** A cluster of issues that share one or more files */
export interface IssueCluster {
  issues: number[];
  sharedFiles: string[];
}

export interface OverlapSuccess {
  success: true;
  data: {
    /** True if no overlaps detected */
    clean: boolean;
    /** Individual file overlaps */
    overlaps: FileOverlap[];
    /** Clusters of issues grouped by shared files (via union-find) */
    clusters: IssueCluster[];
  };
}

export interface OverlapFailure {
  success: false;
  error: {
    code: OverlapErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}

export type OverlapResult = OverlapSuccess | OverlapFailure;

// ── INTERFACE ───────────────────────────────────────────────────────

export interface OverlapSpec {
  execute(input: OverlapInput): OverlapResult;
}
