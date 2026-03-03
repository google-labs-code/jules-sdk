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

export const ConflictResolutionInputSchema = z.object({
  /** Repository owner */
  owner: z.string().min(1),
  /** Repository name */
  repo: z.string().min(1),
  /** Base branch to merge into */
  baseBranch: z.string().default('main'),
  /** The PR that has a merge conflict */
  conflictingPR: z.object({
    number: z.number().positive(),
    branchName: z.string().min(1),
    body: z.string().optional(),
  }),
  /** Files causing the conflict */
  conflictingFiles: z.array(z.string().min(1)).min(1),
  /** Other PRs in the same conflict group (awareness context) */
  peerPRs: z
    .array(
      z.object({
        number: z.number().positive(),
        files: z.array(z.string()),
      }),
    )
    .default([]),
  /** Max conflict notifications before falling back to redispatch */
  maxNotifications: z.number().positive().default(3),
});

export type ConflictResolutionInput = z.infer<
  typeof ConflictResolutionInputSchema
>;

// ── ERROR CODES ─────────────────────────────────────────────────────

export const ConflictResolutionErrorCode = z.enum([
  /** Could not extract session ID from branch name */
  'SESSION_NOT_FOUND',
  /** API error sending message to session */
  'SEND_MESSAGE_FAILED',
  /** Max notifications reached, should redispatch */
  'MAX_NOTIFICATIONS_REACHED',
  /** Unexpected error */
  'UNKNOWN_ERROR',
]);

export type ConflictResolutionErrorCode = z.infer<
  typeof ConflictResolutionErrorCode
>;

// ── RESULT ──────────────────────────────────────────────────────────

export interface ConflictResolutionSuccess {
  success: true;
  data: {
    action: 'notified' | 'already-notified';
    sessionId: string;
    /** Total conflict notifications on this PR (including this one) */
    notificationCount: number;
  };
}

export interface ConflictResolutionFailure {
  success: false;
  error: {
    code: ConflictResolutionErrorCode;
    message: string;
    /** When true, caller should fall back to redispatch */
    fallbackToRedispatch: boolean;
  };
}

export type ConflictResolutionResult =
  | ConflictResolutionSuccess
  | ConflictResolutionFailure;

// ── CONSTANTS ───────────────────────────────────────────────────────

/** Hidden HTML tag for machine-readable comment identification */
export const CONFLICT_NOTIFICATION_TAG = '<!-- fleet:conflict-notification -->';

/** Human-readable header rendered after the tag */
export const CONFLICT_NOTIFICATION_HEADER = '⚠️ **Fleet Conflict Notification**';

// ── INTERFACE ───────────────────────────────────────────────────────

export interface ConflictResolutionSpec {
  execute(input: ConflictResolutionInput): Promise<ConflictResolutionResult>;
}
