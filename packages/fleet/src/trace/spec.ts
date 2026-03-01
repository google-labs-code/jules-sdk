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

export const TraceInputSchema = z
  .object({
    /** Jules session ID to trace */
    sessionId: z.string().optional(),
    /** GitHub issue number to trace */
    issueNumber: z.number().int().positive().optional(),
    /** Milestone title/number to trace all issues in the milestone */
    milestone: z.string().optional(),
    /** Repository in owner/repo format */
    repo: z.string().refine((s) => s.includes('/'), {
      message: 'repo must be in owner/repo format',
    }),
    /** Output format */
    format: z.enum(['json', 'md']).default('json'),
  })
  .refine(
    (d) => d.sessionId || d.issueNumber || d.milestone,
    'One of sessionId, issueNumber, or milestone is required',
  );

export type TraceInput = z.infer<typeof TraceInputSchema>;

// ── ERROR CODES ─────────────────────────────────────────────────────

export const TraceErrorCode = z.enum([
  'SESSION_NOT_FOUND',
  'ISSUE_NOT_FOUND',
  'MILESTONE_NOT_FOUND',
  'PR_NOT_FOUND',
  'GITHUB_API_ERROR',
  'UNKNOWN_ERROR',
]);
export type TraceErrorCode = z.infer<typeof TraceErrorCode>;

// ── TRACE DATA TYPES ────────────────────────────────────────────────

/** A single event in the trace timeline */
export interface TraceEvent {
  timestamp: string;
  type: string;
  description: string;
  actor: 'fleet' | 'jules' | 'github' | 'user';
}

/** Trace data for a single session */
export interface SessionTrace {
  sessionId: string;
  /** Issue this session was dispatched from, null for non-fleet sessions */
  dispatchedBy: {
    issueNumber: number;
    issueTitle: string;
  } | null;
  /** PR created by this session, null if not yet created */
  pullRequest: {
    number: number;
    title: string;
    state: string;
    merged: boolean;
  } | null;
  /** Files changed in this session */
  changedFiles: string[];
  /** Timeline of events */
  events: TraceEvent[];
  /** Environment context */
  environment: 'local' | 'ci';
}

/** Quality scores for evaluation */
export interface TraceScores {
  /** Did the PR merge cleanly? */
  mergeSuccess: boolean | null;
  /** Number of files changed */
  filesChanged: number;
  /** Did the PR reference the dispatching issue? */
  issueLinked: boolean;
}

/** Complete trace data for a single entry point */
export interface TraceData {
  /** Entry point used for this trace */
  entryPoint: 'session' | 'issue' | 'milestone';
  /** Repository */
  repo: string;
  /** Session traces (one for session entry, potentially many for issue/milestone) */
  sessions: SessionTrace[];
  /** Evaluation scores (null for non-fleet sessions) */
  scores: TraceScores | null;
  /** Timestamp of trace generation */
  generatedAt: string;
}

// ── RESULT ──────────────────────────────────────────────────────────

export interface TraceSuccess {
  success: true;
  data: TraceData;
}

export interface TraceFailure {
  success: false;
  error: {
    code: TraceErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}

export type TraceResult = TraceSuccess | TraceFailure;

// ── INTERFACE ───────────────────────────────────────────────────────

export interface TraceSpec {
  execute(input: TraceInput): Promise<TraceResult>;
}
