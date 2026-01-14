/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// src/index.ts
import { JulesClientImpl } from './client.js';
import { NodeFileStorage, NodeSessionStorage } from './storage/node-fs.js';
import { NodePlatform } from './platform/node.js';
import { JulesClient, JulesOptions, StorageFactory } from './types.js';
import { getRootDir } from './storage/root.js';

// Define defaults for the Node.js environment
const defaultPlatform = new NodePlatform();
const defaultStorageFactory: StorageFactory = {
  activity: (sessionId: string) => new NodeFileStorage(sessionId, getRootDir()),
  session: () => new NodeSessionStorage(getRootDir()),
};

/**
 * Connects to the Jules service using Node.js defaults (File System, Native Crypto).
 * Acts as a factory method for creating a new client instance.
 *
 * @param options Configuration options for the client.
 * @returns A new JulesClient instance.
 */
export function connect(options: JulesOptions = {}): JulesClient {
  return new JulesClientImpl(options, defaultStorageFactory, defaultPlatform);
}

/**
 * The main entry point for the Jules SDK.
 * This is a pre-initialized client that can be used immediately with default settings
 * (e.g., reading API keys from environment variables).
 *
 * @example
 * import { jules } from 'modjules';
 * const session = await jules.session({ ... });
 */
export const jules: JulesClient = connect();

// Re-export all the types for convenience
export * from './errors.js';
export type {
  Activity,
  ActivityAgentMessaged,
  ActivityPlanApproved,
  ActivityPlanGenerated,
  ActivityProgressUpdated,
  ActivitySummary,
  ActivitySessionCompleted,
  ActivitySessionFailed,
  ActivityUserMessaged,
  Artifact,
  AutomatedSession,
  ChangeSet,
  GitHubRepo,
  GitPatch,
  JulesClient,
  JulesOptions,
  LightweightActivity,
  LightweightArtifact,
  MediaArtifact,
  Outcome,
  ParsedChangeSet,
  ParsedFile,
  Plan,
  PlanStep,
  PullRequest,
  SessionClient,
  SessionConfig,
  SessionOutput,
  SessionResource,
  SessionState,
  Source,
  SourceContext,
  SourceInput,
  SourceManager,
  StrippedMediaArtifact,
  JulesQuery,
  JulesDomain,
  SyncDepth,
} from './types.js';

// Re-export schema and validation for MCP and other consumers
export {
  SESSION_SCHEMA,
  ACTIVITY_SCHEMA,
  FILTER_OP_SCHEMA,
  PROJECTION_SCHEMA,
  getSchema,
  getAllSchemas,
  generateTypeDefinition,
  generateMarkdownDocs,
} from './query/schema.js';
export type { FieldMeta, DomainSchema, QueryExample } from './query/schema.js';
export { validateQuery, formatValidationResult } from './query/validate.js';
export type {
  ValidationError,
  ValidationWarning,
  ValidationResult,
  ValidationErrorCode,
} from './query/validate.js';

export { SessionCursor } from './sessions.js';
export type { ListSessionsOptions, ListSessionsResponse } from './sessions.js';

// Activity utilities
export { toSummary } from './activities/summary.js';

// Internal exports for @modjules/server package
export { JulesClientImpl } from './client.js';
export { MemoryStorage, MemorySessionStorage } from './storage/memory.js';
export { NodePlatform } from './platform/node.js';
export type { Platform } from './platform/types.js';
export type { StorageFactory } from './types.js';

// Artifact classes with helper methods
export { ChangeSetArtifact, BashArtifact, parseUnidiff } from './artifacts.js';
