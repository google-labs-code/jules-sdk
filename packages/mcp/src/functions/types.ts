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

/**
 * The last activity in the session.
 */
export interface LastActivity {
  /** Activity ID */
  activityId: string;
  /** Activity type (e.g., 'agentMessaged', 'sessionCompleted', 'progressUpdated') */
  type: string;
  /** When the activity occurred */
  timestamp: string;
}

/**
 * The last message sent by Jules to the user.
 */
export interface LastAgentMessage {
  /** Activity ID containing this message */
  activityId: string;
  /** The message content */
  content: string;
  /** When the message was sent */
  timestamp: string;
}

/**
 * A step in a pending plan.
 */
export interface PlanStepSummary {
  /** Step title */
  title: string;
  /** Step description */
  description?: string;
}

/**
 * A plan awaiting approval.
 */
export interface PendingPlan {
  /** Activity ID that generated this plan */
  activityId: string;
  /** Plan ID (use this when approving) */
  planId: string;
  /** The steps in the plan */
  steps: PlanStepSummary[];
}

export interface SessionStateResult {
  id: string;
  /**
   * Semantic status synthesized from the technical state.
   * - 'busy': Jules is actively working (queued, planning, inProgress)
   * - 'stable': Work is paused and safe to review (awaitingPlanApproval, awaitingUserFeedback, paused, completed)
   * - 'failed': Session encountered an error (failed)
   */
  status: SessionStatus;
  url: string;
  title: string;
  /**
   * The original prompt that started this session.
   * Use this to evaluate if a pending plan aligns with the user's intent.
   */
  prompt?: string;
  pr?: {
    url: string;
    title: string;
  };
  /**
   * The last activity in the session. Shows what just happened.
   */
  lastActivity?: LastActivity;
  /**
   * The last message sent by Jules. Useful for understanding what Jules
   * communicated, especially when awaiting user feedback or after completion.
   */
  lastAgentMessage?: LastAgentMessage;
  /**
   * A plan awaiting approval. Present when lastActivity.type is 'planGenerated'.
   * Use send_reply_to_session with action 'approve' to approve the plan.
   */
  pendingPlan?: PendingPlan;
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

