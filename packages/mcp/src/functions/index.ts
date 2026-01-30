/**
 * Pure functions for Jules MCP operations.
 * These functions can be used independently of the MCP server.
 */

// Export all functions
export { getSessionState } from './session-state.js';
export { getBashOutputs } from './bash-outputs.js';
export { listSessions } from './list-sessions.js';
export { createSession } from './create-session.js';
export { interact } from './interact.js';
export { select } from './select.js';
export { getSchema } from './schema.js';
export { validateQuery } from './validate-query.js';
export { codeReview } from './code-review.js';
export { showDiff } from './show-diff.js';

// Export all types
export type {
  // Session State
  SessionStatus,
  SessionStateResult,
  // Bash Outputs
  BashOutput,
  BashOutputsSummary,
  BashOutputsResult,
  // File Changes (shared)
  FileChange,
  FilesSummary,
  FileChangeDetail,
  CodeChangesSummary,
  // List Sessions
  ListSessionsOptions,
  ListSessionsResult,
  // Create Session
  CreateSessionOptions,
  CreateSessionResult,
  // Interact
  InteractAction,
  InteractResult,
  // Select
  SelectOptions,
  SelectResult,
  // Schema
  SchemaFormat,
  SchemaDomain,
  SchemaResult,
  // Validate Query
  ValidationResult,
  // Review Changes
  ReviewChangesFormat,
  ReviewChangesFilter,
  ReviewDetail,
  ReviewChangesOptions,
  ReviewChangesResult,
  // Show Diff
  ShowDiffOptions,
  ShowDiffResult,
} from './types.js';
