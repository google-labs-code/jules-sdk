/**
 * Return types for pure MCP functions.
 * These types define the shape of data returned by functions,
 * independent of MCP protocol formatting.
 */

import type { SessionResource } from '@google/jules-sdk';

// ============================================================================
// Session State
// ============================================================================

/**
 * Semantic status indicating the session's current operational state.
 * - 'busy': Data is volatile; Jules is actively working. Do not review yet.
 * - 'stable': Work is paused; safe to review code changes and outputs.
 * - 'failed': Session encountered an error and cannot continue.
 */
export type SessionStatus = 'busy' | 'stable' | 'failed';

export interface SessionStateResult {
  id: string;
  /**
   * The raw technical state from the API (e.g., 'inProgress', 'completed').
   */
  state: string;
  /**
   * Semantic status synthesized from the technical state.
   * - 'busy': Jules is actively working (queued, planning, inProgress)
   * - 'stable': Work is paused and safe to review (awaitingPlanApproval, awaitingUserFeedback, paused, completed)
   * - 'failed': Session encountered an error (failed)
   */
  status: SessionStatus;
  url: string;
  title: string;
  pr?: {
    url: string;
    title: string;
  };
}

// ============================================================================
// File Changes (shared types)
// ============================================================================

export interface FileChange {
  path: string;
  changeType: 'created' | 'modified' | 'deleted';
  activityIds: string[];
  additions: number;
  deletions: number;
}

export interface FilesSummary {
  totalFiles: number;
  created: number;
  modified: number;
  deleted: number;
}

export interface FileChangeDetail {
  path: string;
  changeType: 'created' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
}

export interface CodeChangesSummary {
  totalFiles: number;
  created: number;
  modified: number;
  deleted: number;
}

// ============================================================================
// Bash Outputs
// ============================================================================

export interface BashOutput {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  activityId: string;
}

export interface BashOutputsSummary {
  totalCommands: number;
  succeeded: number;
  failed: number;
}

export interface BashOutputsResult {
  sessionId: string;
  outputs: BashOutput[];
  summary: BashOutputsSummary;
}

// ============================================================================
// List Sessions
// ============================================================================

export interface ListSessionsOptions {
  pageSize?: number;
  pageToken?: string;
}

export interface ListSessionsResult {
  sessions: SessionResource[];
  nextPageToken?: string;
}

// ============================================================================
// Create Session
// ============================================================================

export interface CreateSessionOptions {
  prompt: string;
  /** GitHub repository (owner/repo). Optional for repoless sessions. */
  repo?: string;
  /** Target branch. Optional for repoless sessions. */
  branch?: string;
  interactive?: boolean;
  autoPr?: boolean;
}

export interface CreateSessionResult {
  id: string;
}

// ============================================================================
// Interact
// ============================================================================

export type InteractAction = 'approve' | 'send' | 'ask';

export interface InteractResult {
  success: boolean;
  message?: string;
  reply?: string;
}

// ============================================================================
// Select
// ============================================================================

export interface SelectOptions {
  tokenBudget?: number;
}

export interface SelectResult<T = unknown> {
  results: T[];
  _meta?: {
    truncated: boolean;
    tokenCount: number;
    tokenBudget: number;
  };
}

// ============================================================================
// Schema
// ============================================================================

export type SchemaFormat = 'json' | 'markdown';
export type SchemaDomain = 'sessions' | 'activities' | 'all';

export interface SchemaResult {
  content: string | object;
  format: SchemaFormat;
}

// ============================================================================
// Validate Query
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  message: string;
}

// ============================================================================
// Review Changes
// ============================================================================

export type ReviewChangesFormat = 'summary' | 'tree' | 'detailed' | 'markdown';
export type ReviewChangesFilter = 'all' | 'created' | 'modified' | 'deleted';
export type ReviewDetail = 'minimal' | 'standard' | 'full';

export interface ReviewChangesOptions {
  format?: ReviewChangesFormat;
  filter?: ReviewChangesFilter;
  detail?: ReviewDetail;
  /** Optional activity ID to review changes from a single activity instead of the whole session */
  activityId?: string;
}

export interface ReviewChangesResult {
  sessionId: string;
  title: string;
  state: string;
  status: SessionStatus;
  url: string;
  /** Whether the session has ever been in a stable state before */
  hasStableHistory?: boolean;
  /** Warning message if session was stable but is now busy again */
  warning?: string;
  // Timing (standard/full detail)
  createdAt?: string;
  updatedAt?: string;
  durationMs?: number;
  // PR info if available
  pr?: {
    url: string;
    title: string;
  };
  // Insights (standard/full detail)
  insights?: {
    completionAttempts: number;
    planRegenerations: number;
    userInterventions: number;
    failedCommandCount: number;
  };
  // Activity counts (full detail only)
  activityCounts?: Record<string, number>;
  // File changes
  files: FileChange[];
  summary: FilesSummary;
  formatted: string;
}

// ============================================================================
// Show Diff
// ============================================================================

export interface ShowDiffOptions {
  file?: string;
  /** Optional activity ID to get diff from a specific activity instead of the session outcome */
  activityId?: string;
}

export interface ShowDiffResult {
  sessionId: string;
  /** Activity ID if diff was from a specific activity */
  activityId?: string;
  file?: string;
  unidiffPatch: string;
  files: FileChangeDetail[];
  summary: CodeChangesSummary;
}

// ============================================================================
// Work In Progress
// ============================================================================

export interface FileStatEntry {
  path: string;
  changeType: 'created' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
  /** Activity IDs that touched this file */
  activityIds: string[];
}

export interface WorkInProgressSummary {
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  created: number;
  modified: number;
  deleted: number;
}

export interface WorkInProgressOptions {
  /** Include recent activity timeline. Default: true */
  includeTimeline?: boolean;
}

export interface WorkInProgressResult {
  sessionId: string;
  title: string;
  state: string;
  status: SessionStatus;
  url: string;
  activityCount: number;
  files: FileStatEntry[];
  summary: WorkInProgressSummary;
  formatted: string;
}

