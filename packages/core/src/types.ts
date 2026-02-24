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

//
// Jules TypeScript SDK Types
//
// This file defines the public interfaces and types for the Jules SDK,
// adhering to modern TypeScript conventions (camelCase, Discriminated Unions, Async Iterators).
// Detailed comments map these types to the corresponding REST API resources and endpoints.
//

// =============================================================================
// Configuration Types
// =============================================================================

import { ActivityClient, SelectOptions } from './activities/types.js';
import { ActivityStorage, SessionStorage } from './storage/types.js';
import { ListSessionsOptions, SessionCursor } from './sessions.js';

export { SelectOptions };

/**
 * A factory object that creates storage instances.
 * @internal
 */
export type StorageFactory = {
  activity: (sessionId: string) => ActivityStorage;
  session: () => SessionStorage;
};

/**
 * Configuration options for the Jules SDK client.
 *
 * @example
 * import { Jules } from '@google/jules-sdk';
 *
 * const jules = Jules({
 *   apiKey: 'YOUR_API_KEY',
 *   config: {
 *     requestTimeoutMs: 60000, // 1 minute
 *   }
 * });
 */
export interface JulesOptions {
  /**
   * The API key used for authentication.
   * If not provided, the SDK will attempt to read it from the JULES_API_KEY environment variable.
   * Authenticates requests via the `X-Goog-Api-Key` header.
   */
  apiKey?: string;
  /**
   * **FOR TEST/DEV USE ONLY.**
   * Explicitly sets the API key for client-side environments (like browsers).
   * Do NOT use this in production as it exposes your credentials.
   *
   * @deprecated Use `apiKey` in secure server-side environments instead.
   */
  apiKey_TEST_ONLY_DO_NOT_USE_IN_PRODUCTION?: string;
  /**
   * The base URL for the Jules API.
   * @default 'https://jules.googleapis.com/v1alpha'
   */
  baseUrl?: string;
  /**
   * (Internal) A factory for creating storage instances.
   * This is used to inject platform-specific storage implementations (Node vs. Browser).
   * @internal
   */
  storageFactory?: StorageFactory;
  /**
   * (Internal) The platform implementation.
   * This is used to inject platform-specific functionality (Node vs. Browser).
   * @internal
   */
  platform?: any;
  /**
   * Advanced operational parameters for the SDK.
   */
  config?: {
    /**
     * The interval in milliseconds to poll for session and activity updates.
     * @default 5000
     */
    pollingIntervalMs?: number;
    /**
     * The timeout in milliseconds for individual HTTP requests to the Jules API.
     * @default 30000
     */
    requestTimeoutMs?: number;
    /**
     * Configuration for 429 rate limit retry behavior.
     * The SDK will automatically retry rate-limited requests with exponential backoff
     * until the configured time window is exhausted.
     */
    rateLimitRetry?: {
      /**
       * Maximum time in milliseconds to keep retrying before throwing JulesRateLimitError.
       * @default 300000 (5 minutes)
       */
      maxRetryTimeMs?: number;
      /**
       * Base delay in milliseconds for exponential backoff.
       * @default 1000
       */
      baseDelayMs?: number;
      /**
       * Maximum delay in milliseconds between retry attempts.
       * @default 30000
       */
      maxDelayMs?: number;
    };
  };
}

/**
 * Ergonomic definition for specifying a source context when creating a session or run.
 * This simplifies the process of targeting a specific GitHub repository and branch.
 *
 * @example
 * const sourceInput: SourceInput = {
 *   github: 'my-org/my-repo',
 *   baseBranch: 'main'
 * };
 */
export interface SourceInput {
  /**
   * The GitHub repository identifier in the format 'owner/repo'.
   * The SDK will resolve this to the full source name (e.g., 'sources/github/owner/repo').
   */
  github: string;
  /**
   * The base branch that Jules will branch off of when starting the session.
   * Maps to `sourceContext.githubRepoContext.startingBranch` in the REST API.
   */
  baseBranch: string;
}

/**
 * Configuration options for starting a new session or run.
 * This is the primary input for `jules.run()` and `jules.session()`.
 *
 * @example
 * const config: SessionConfig = {
 *   prompt: "Fix the login button bug.",
 *   source: { github: 'my-org/my-repo', baseBranch: 'main' },
 *   requireApproval: false
 * };
 */
export interface SessionConfig {
  /**
   * The initial instruction or task description for the agent.
   * Required. Maps to `prompt` in the REST API `POST /sessions` payload.
   */
  prompt: string;
  /**
   * The source code context for the session.
   * Optional. If omitted, creates a "repoless" session not attached to any repository.
   * The SDK constructs the `sourceContext` payload from this input when provided.
   */
  source?: SourceInput;
  /**
   * Optional title for the session. If not provided, the system will generate one.
   * Maps to `title` in the REST API.
   */
  title?: string;
  /**
   * If true, the agent will pause and wait for explicit approval (via `session.approve()`)
   * before executing any generated plan.
   *
   * @default false for `jules.run()`
   * @default true for `jules.session()`
   */
  requireApproval?: boolean;
  /**
   * If true, the agent will automatically create a Pull Request when the task is completed.
   * Maps to `automationMode: AUTO_CREATE_PR` in the REST API.
   * If false, maps to `AUTOMATION_MODE_UNSPECIFIED`.
   *
   * @default true for `jules.run()`
   */
  autoPr?: boolean;
}

// =============================================================================
// Core Resource Types (REST API Mappings)
// =============================================================================

// -----------------------------------------------------------------------------
// Source Types
// -----------------------------------------------------------------------------

/**
 * Represents the details of a GitHub repository connected to Jules.
 * Maps to the `GitHubRepo` message in the REST API.
 */
export interface GitHubRepo {
  owner: string;
  repo: string;
  isPrivate: boolean;
  defaultBranch?: string;
  branches?: string[];
}

/**
 * An input source of data for a session (e.g., a GitHub repository).
 * This is a discriminated union based on the `type` property.
 * Maps to the `Source` resource in the REST API.
 *
 * @example
 * async (source: Source) => {
 *   if (source.type === 'githubRepo') {
 *     console.log(source.githubRepo.owner);
 *   }
 * }
 */
export type Source = {
  /**
   * The full resource name (e.g., "sources/github/owner/repo").
   */
  name: string;
  /**
   * The short identifier of the source (e.g., "github/owner/repo").
   */
  id: string;
} & {
  type: 'githubRepo';
  githubRepo: GitHubRepo;
};

// -----------------------------------------------------------------------------
// Session Types
// -----------------------------------------------------------------------------

/**
 * Represents the possible states of a session.
 * Maps to the `State` enum in the REST API `Session` resource.
 */
export type SessionState =
  | 'unspecified'
  | 'queued'
  | 'planning'
  /** The agent is waiting for plan approval. Call `session.approve()`. */
  | 'awaitingPlanApproval'
  | 'awaitingUserFeedback'
  | 'inProgress'
  | 'paused'
  | 'failed'
  | 'completed';

/**
 * The automation mode for the session.
 */
export type AutomationMode = 'AUTOMATION_MODE_UNSPECIFIED' | 'AUTO_CREATE_PR';

/**
 * The entity that an activity originates from.
 */
export type Origin = 'user' | 'agent' | 'system';

/**
 * A pull request created by the session.
 * Maps to the `PullRequest` message in the REST API.
 */
export interface PullRequest {
  url: string;
  title: string;
  description: string;
  baseRef?: string;
  headRef?: string;
}

/**
 * An output of a session, such as a pull request or changeset.
 * This is a discriminated union based on the `type` property.
 * Maps to the `SessionOutput` message in the REST API.
 *
 * @example
 * (output: SessionOutput) => {
 *   if (output.type === 'pullRequest') {
 *     console.log('PR URL:', output.pullRequest.url);
 *   } else if (output.type === 'changeSet') {
 *     console.log('Changes:', output.changeSet.gitPatch.unidiffPatch);
 *   }
 * }
 */
export type SessionOutput =
  | {
      type: 'pullRequest';
      pullRequest: PullRequest;
    }
  | {
      type: 'changeSet';
      changeSet: ChangeSet;
    };

/**
 * Represents the context used when the session was created.
 * Maps to the `SourceContext` message in the REST API.
 */
export interface SourceContext {
  /**
   * The name of the source (e.g., "sources/github/owner/repo").
   */
  source: string;
  /**
   * Context specific to GitHub repos.
   */
  githubRepoContext?: {
    startingBranch: string;
  };
  workingBranch?: string;
  environmentVariablesEnabled?: boolean;
}

/**
 * The underlying data structure representing a Session resource from the REST API.
 * The SDK enhances this with helper methods in the `SessionClient`.
 */
export interface SessionResource {
  /**
   * The full resource name (e.g., "sessions/314159...").
   */
  name: string;
  /**
   * The unique ID of the session.
   */
  id: string;
  prompt: string;
  sourceContext: SourceContext;
  source?: Source;
  title: string;
  requirePlanApproval?: boolean;
  automationMode?: AutomationMode;
  archived?: boolean;
  /**
   * The time the session was created (RFC 3339 timestamp).
   */
  createTime: string;
  /**
   * The time the session was last updated (RFC 3339 timestamp).
   */
  updateTime: string;
  /**
   * The current state of the session.
   */
  state: SessionState;
  /**
   * The URL to view the session in the Jules web app.
   */
  url: string;
  /**
   * The outputs of the session, if any.
   */
  outputs: SessionOutput[];
  /**
   * The activities associated with the session.
   * Only populated when `include: { activities: true }` is used in `jules.select()`.
   */
  activities?: Activity[];
  outcome: SessionOutcome;
  /**
   * The generated files of the session if it reaches a stable state.
   */
  generatedFiles?: GeneratedFile[];
}

// -----------------------------------------------------------------------------
// Activity and Artifact Types
// -----------------------------------------------------------------------------

// --- Plan Types ---

/**
 * A single step within an agent's plan.
 * Maps to the `PlanStep` message in the REST API.
 */
export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  index: number;
}

/**
 * A sequence of steps that the agent will take to complete the task.
 * Maps to the `Plan` message in the REST API.
 */
export interface Plan {
  id: string;
  steps: PlanStep[];
  createTime: string;
}

// --- Artifact Types (Discriminated Union) ---

/**
 * A patch in Git's unidiff format.
 * Maps to the `GitPatch` message in the REST API.
 */
export interface GitPatch {
  /**
   * The patch content.
   */
  unidiffPatch: string;
  /**
   * The base commit id the patch should be applied to.
   */
  baseCommitId: string;
  /**
   * A suggested commit message for the.
   */
  suggestedCommitMessage: string;
}

/**
 * A set of changes to be applied to a source.
 * Maps to the `ChangeSet` message in the REST API.
 */
export interface ChangeSet {
  source: string;
  gitPatch: GitPatch;
}

/**
 * A single file change extracted from a unified diff.
 */
export interface ParsedFile {
  /** The file path relative to the repository root */
  path: string;
  /** The type of change */
  changeType: 'created' | 'modified' | 'deleted';
  /** Number of lines added */
  additions: number;
  /** Number of lines removed */
  deletions: number;
}

/**
 * Parsed representation of a ChangeSet's unified diff.
 */
export interface ParsedChangeSet {
  /** Individual file changes */
  files: ParsedFile[];
  /** Summary counts */
  summary: {
    totalFiles: number;
    created: number;
    modified: number;
    deleted: number;
  };
}

/**
 * A file generated by a session, with full content extracted from the diff.
 * This is an SDK-specific enhancement for accessing session outputs as files.
 *
 * @example
 * const files = result.generatedFiles();
 * const readme = files.get('README.md');
 * console.log(readme?.content);
 */
export interface GeneratedFile {
  /** The file path relative to the repository root */
  path: string;
  /** The type of change */
  changeType: 'created' | 'modified' | 'deleted';
  /**
   * The full content of the file.
   * For 'created' files: the complete file content.
   * For 'modified' files: only the added lines (base content is not available).
   * For 'deleted' files: empty string.
   */
  content: string;
  /** Number of lines added */
  additions: number;
  /** Number of lines removed */
  deletions: number;
}

/**
 * A collection of generated files with helper methods for ergonomic access.
 *
 * @example
 * const files = result.generatedFiles();
 *
 * // Get a specific file by path
 * const answer = files.get('answer.md');
 *
 * // Get all new files
 * const newFiles = files.filter('created');
 *
 * // Iterate all files
 * for (const file of files.all()) {
 *   console.log(`${file.path}: ${file.content.length} chars`);
 * }
 */
export interface GeneratedFiles {
  /** Returns all generated files */
  all(): GeneratedFile[];
  /** Find a file by its path */
  get(path: string): GeneratedFile | undefined;
  /** Filter files by change type */
  filter(changeType: 'created' | 'modified' | 'deleted'): GeneratedFile[];
}

/**
 * A set of code changes with a helper method to parse the diff.
 * This is an SDK-specific enhancement.
 */
export interface ChangeSetArtifact {
  readonly type: 'changeSet';
  readonly source: string;
  readonly gitPatch: GitPatch;
  /**
   * Parses the unified diff and returns structured file change information.
   *
   * @returns Parsed diff with file paths, change types, and line counts.
   *
   * @example
   * if (artifact.type === 'changeSet') {
   *   const parsed = artifact.parsed();
   *   console.log(`Changed ${parsed.summary.totalFiles} files`);
   *   for (const file of parsed.files) {
   *     console.log(`${file.changeType}: ${file.path} (+${file.additions}/-${file.deletions})`);
   *   }
   * }
   */
  parsed(): ParsedChangeSet;
}

/**
 * A media output (e.g., an image) with a helper method to save the data.
 * This is an SDK-specific enhancement.
 */
export interface MediaArtifact {
  readonly type: 'media';
  /**
   * The base64-encoded media data.
   */
  readonly data: string;
  /**
   * The format of the media (e.g., 'image/png').
   */
  readonly format: string;
  /**
   * Saves the media data to a file.
   * This method is only available in Node.js environments.
   *
   * @param filepath The path to save the file to.
   * @throws {Error} If called in a non-Node.js environment.
   *
   * @example
   * if (artifact.type === 'media' && artifact.format.startsWith('image/')) {
   *   await artifact.save('./screenshot.png');
   * }
   */
  save(filepath: string): Promise<void>;

  /**
   * Creates a blob URL for the media data.
   * This works in both Node.js and browser environments.
   *
   * @returns A URL string that can be used to display or download the media.
   *
   * @example
   * if (artifact.type === 'media') {
   *   const url = artifact.toUrl();
   *   // Browser: <img src={url} />
   *   // Node: console.log('Media URL:', url);
   * }
   */
  toUrl(): string;
}

/**
 * Output from a bash command execution, with a helper method to format the output.
 * This is an SDK-specific enhancement.
 */
export interface BashArtifact {
  readonly type: 'bashOutput';
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  /**
   * Returns a cleanly formatted string combining the command, output, and exit code.
   *
   * @example
   * if (artifact.type === 'bashOutput') {
   *   console.log(artifact.toString());
   * }
   */
  toString(): string;
}

/**
 * A single unit of data produced by an activity, enhanced with SDK helper methods.
 * This is a discriminated union based on the `type` property.
 * Maps to the `Artifact` resource in the REST API.
 *
 * @example
 * (artifact: Artifact) => {
 *   if (artifact.type === 'changeSet') {
 *     const parsed = artifact.parsed();
 *     console.log(`Modified ${parsed.summary.totalFiles} files`);
 *   }
 * }
 */
export type Artifact = ChangeSetArtifact | MediaArtifact | BashArtifact;

// Raw REST API type definitions, used by mappers.
// These represent the JSON structure before being mapped to rich SDK objects.

/**
 * Represents the raw session resource returned by the API.
 * The `state` field is a string that may be in SCREAMING_SNAKE_CASE.
 */
export interface RestSessionResource extends Omit<SessionResource, 'state' | 'outcome' | 'generatedFiles'> {
  state: string;
  // outcome and generatedFiles are SDK-derived fields, not present in raw API response
}

export interface RestChangeSetArtifact {
  changeSet: ChangeSet;
}

export interface RestMediaArtifact {
  media: {
    data: string;
    format: string;
    mimeType?: string;
  };
}

export interface RestBashOutputArtifact {
  bashOutput: {
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    output?: string;
  };
}

export type RestArtifact =
  | RestChangeSetArtifact
  | RestMediaArtifact
  | RestBashOutputArtifact;

// --- Activity Types (Discriminated Union) ---

/**
 * Base structure for all activities.
 */
interface BaseActivity {
  /**
   * The full resource name (e.g., "sessions/{session}/activities/{activity}").
   */
  name: string;
  id: string;
  /**
   * The time at which this activity was created (RFC 3339 timestamp).
   */
  createTime: string;
  /**
   * The entity that this activity originated from.
   */
  originator: 'user' | 'agent' | 'system';
  /**
   * The artifacts produced by this activity.
   */
  artifacts: Artifact[];
  /**
   * The session that this activity belongs to.
   * Only populated when `include: { session: true }` is used in `jules.select()`.
   */
  session?: SessionResource;
}

/**
 * An activity representing a message from the agent.
 */
export interface ActivityAgentMessaged extends BaseActivity {
  type: 'agentMessaged';
  /**
   * The message the agent posted.
   */
  message: string;
}

/**
 * An activity representing a message from the user.
 */
export interface ActivityUserMessaged extends BaseActivity {
  type: 'userMessaged';
  /**
   * The message the user posted.
   */
  message: string;
}

/**
 * An activity representing a newly generated plan.
 */
export interface ActivityPlanGenerated extends BaseActivity {
  type: 'planGenerated';
  /**
   * The plan that was generated.
   */
  plan: Plan;
}

/**
 * An activity representing the approval of a plan.
 */
export interface ActivityPlanApproved extends BaseActivity {
  type: 'planApproved';
  /**
   * The ID of the plan that was approved.
   */
  planId: string;
}

/**
 * An activity representing a progress update from the agent.
 */
export interface ActivityProgressUpdated extends BaseActivity {
  type: 'progressUpdated';
  /**
   * The title of the progress update.
   */
  title: string;
  /**
   * The description of the progress update.
   */
  description: string;
}

/**
 * An activity signifying the successful completion of a session.
 */
export interface ActivitySessionCompleted extends BaseActivity {
  type: 'sessionCompleted';
}

/**
 * An activity signifying the failure of a session.
 */
export interface ActivitySessionFailed extends BaseActivity {
  type: 'sessionFailed';
  /**
   * The reason the session failed.
   */
  reason: string;
}

/**
 * A lightweight summary of an activity, designed for token-efficient transmission.
 */
export interface ActivitySummary {
  id: string;
  type: string;
  createTime: string;
  summary: string;
}

/**
 * A media artifact with its base64 data stripped.
 */
export type StrippedMediaArtifact = Omit<MediaArtifact, 'data'> & {
  dataStripped: true;
  hasData: true;
};

/**
 * A union of artifact types that can be included in a lightweight activity.
 */
export type LightweightArtifact =
  | Exclude<Artifact, MediaArtifact>
  | StrippedMediaArtifact;

/**
 * A lightweight representation of an activity, with artifacts stripped by default.
 */
export interface LightweightActivity extends ActivitySummary {
  /**
   * The full message content for activities that have one (agentMessaged, userMessaged).
   * Unlike `summary`, this is not truncated.
   */
  message?: string;
  artifacts: LightweightArtifact[] | null;
  artifactCount: number;
}

/**
 * A single event or unit of work within a session.
 * This discriminated union represents all possible activities streamed by the SDK.
 * Maps to the `Activity` resource in the REST API.
 *
 * @example
 * (activity: Activity) => {
 *   switch (activity.type) {
 *     case 'planGenerated':
 *       console.log('Plan:', activity.plan.steps.map(s => s.title));
 *       break;
 *     case 'agentMessaged':
 *       console.log('Agent says:', activity.message);
 *       break;
 *   }
 * }
 */
export type Activity =
  | ActivityAgentMessaged
  | ActivityUserMessaged
  | ActivityPlanGenerated
  | ActivityPlanApproved
  | ActivityProgressUpdated
  | ActivitySessionCompleted
  | ActivitySessionFailed;

// =============================================================================
// SDK Abstraction Interfaces
// =============================================================================

// -----------------------------------------------------------------------------
// AutomatedSession Abstraction (Automation Paradigm)
// -----------------------------------------------------------------------------

/**
 * The final outcome of a completed session or run.
 * This is derived from the final SessionResource state.
 *
 * @example
 * (outcome: SessionOutcome) => {
 *   if (outcome.state === 'completed' && outcome.pullRequest) {
 *     console.log(`Success! PR: ${outcome.pullRequest.url}`);
 *   }
 * }
 */
export interface SessionOutcome {
  sessionId: string;
  title: string;
  state: 'completed' | 'failed';
  /**
   * The primary Pull Request created by the session, if applicable.
   */
  pullRequest?: PullRequest;
  /**
   * All outputs generated by the session.
   */
  outputs: SessionOutput[];
  /**
   * Returns all files generated by this session with their full content.
   * This is a convenience method for accessing session outputs as files.
   *
   * @example
   * const result = await session.result();
   * const files = result.generatedFiles();
   * const answer = files.get('answer.md');
   * console.log(answer?.content);
   */
  generatedFiles(): GeneratedFiles;
  /**
   * Returns the change set artifact if one exists, providing access to
   * the unified diff and parsed file changes.
   *
   * @example
   * const result = await session.result();
   * const changeSet = result.changeSet();
   * if (changeSet) {
   *   const parsed = changeSet.parsed();
   *   console.log(`${parsed.summary.totalFiles} files changed`);
   * }
   */
  changeSet(): ChangeSetArtifact | undefined;
}

/**
 * Represents a Jules Session in automated mode, initiated by `jules.run()`.
 *
 * It provides methods for real-time observation and retrieving the final outcome.
 */
export interface AutomatedSession {
  /**
   * The unique ID of the session.
   */
  readonly id: string;

  /**
   * Provides a real-time stream of activities as the automated run progresses.
   * This uses an Async Iterator, making it easy to consume events as they happen.
   *
   * @example
   * const run = await jules.run({ ... });
   * for await (const activity of run.stream()) {
   *   console.log(`[${activity.type}]`);
   * }
   */
  stream(): AsyncIterable<Activity>;

  /**
   * Waits for the session to complete and returns the final outcome.
   *
   * @example
   * const run = await jules.run({ ... });
   * const outcome = await run.result();
   */
  result(): Promise<SessionOutcome>;
}

// -----------------------------------------------------------------------------
// Query Engine Types (Phase 3)
// -----------------------------------------------------------------------------

/**
 * Valid root domains for the local graph.
 */
export type JulesDomain = 'sessions' | 'activities';

/**
 * Filter operators for the 'where' clause.
 */
export type FilterOp<V> =
  | V
  | {
      eq?: V;
      neq?: V;
      contains?: string; // Fuzzy text search (case-insensitive)
      gt?: V;
      lt?: V;
      gte?: V;
      lte?: V;
      in?: V[];
      exists?: boolean; // Field existence check
    };

/**
 * Domain-specific filter definitions.
 */
export type WhereClause<T extends JulesDomain> = T extends 'sessions'
  ? {
      id?: FilterOp<string>;
      state?: FilterOp<string>;
      title?: FilterOp<string>;
      search?: string;
    }
  : {
      id?: FilterOp<string>;
      type?: FilterOp<string>;
      sessionId?: FilterOp<string>;
      search?: string;
    };

/**
 * Defines which related nodes to fetch.
 */
export type IncludeClause<T extends JulesDomain> = T extends 'sessions'
  ? {
      activities?:
        | boolean
        | {
            where?: WhereClause<'activities'>;
            limit?: number;
            select?: (keyof Activity)[];
          };
    }
  : { session?: boolean | { select?: (keyof SessionResource)[] } };

/**
 * The Unified Query Schema.
 */
export interface JulesQuery<T extends JulesDomain> {
  from: T;
  select?: T extends 'sessions'
    ? (keyof SessionResource)[]
    : (keyof Activity)[];
  where?: WhereClause<T>;
  include?: IncludeClause<T>;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
  startAt?: string;
  startAfter?: string;
}

/**
 * Maps the domain to its resulting object type.
 */
export type QueryResult<T extends JulesDomain> = T extends 'sessions'
  ? SessionResource
  : Activity;

// -----------------------------------------------------------------------------
// SessionClient (Interactive Paradigm)
// -----------------------------------------------------------------------------

/**
 * Options for streaming activities, such as filtering.
 * This is a forward declaration; the actual type is in `streaming.ts`
 * to avoid circular dependencies.
 * @internal
 */
export type StreamActivitiesOptions = {
  exclude?: {
    originator: Origin;
  };
};

/**
 * Represents an active, interactive session with the Jules agent.
 * This is the primary interface for managing the lifecycle of an interactive session.
 */
export interface SessionClient {
  /**
   * The unique ID of the session.
   */
  readonly id: string;

  /**
   * Scoped access to activity-specific operations.
   */
  readonly activities: ActivityClient;

  /**
   * COLD STREAM: Yields all known past activities from local storage.
   * Ends immediately after yielding the last known activity.
   * Does NOT open a network connection.
   */
  history(): AsyncIterable<Activity>;

  /**
   * HOT STREAM: Yields ONLY future activities as they arrive from the network.
   * Blocks indefinitely.
   */
  updates(): AsyncIterable<Activity>;

  /**
   * LOCAL QUERY: Performs rich filtering against local storage only.
   * Fast, but might be incomplete if not synced.
   *
   * @deprecated Use `session.activities.select()` instead.
   */
  select(options?: SelectOptions): Promise<Activity[]>;

  /**
   * Provides a real-time stream of activities for the session.
   * This uses an Async Iterator to abstract the polling of the ListActivities endpoint.
   *
   * @param options Options to control the stream, such as filters.
   * @example
   * // Filter out activities originated by the user
   * for await (const activity of session.stream({ exclude: { originator: 'user' } })) {
   *   console.log(activity.type);
   * }
   */
  stream(options?: StreamActivitiesOptions): AsyncIterable<Activity>;

  /**
   * Approves the currently pending plan.
   * Only valid if the session state is `awaitingPlanApproval`.
   *
   * @example
   * await session.waitFor('awaitingPlanApproval');
   * await session.approve();
   */
  approve(): Promise<void>;

  /**
   * Sends a message (prompt) to the agent in the context of the current session.
   * This is a fire-and-forget operation. To see the response, use `stream()` or `ask()`.
   *
   * @param prompt The message to send.
   * @example
   * await session.send("Can you start working on the first step?");
   */
  send(prompt: string): Promise<void>;

  /**
   * Sends a message to the agent and waits specifically for the agent's immediate reply.
   * This provides a convenient request/response flow for conversational interactions.
   *
   * @param prompt The message to send.
   * @returns The agent's reply activity.
   * @example
   * const reply = await session.ask("What is the status of the plan?");
   * console.log(reply.message);
   */
  ask(prompt: string): Promise<ActivityAgentMessaged>;

  /**
   * Waits for the session to reach a terminal state (completed or failed) and returns the result.
   *
   * @returns The final outcome of the session.
   * @example
   * const outcome = await session.result();
   * console.log(`Session finished with state: ${outcome.state}`);
   */
  result(): Promise<SessionOutcome>;

  /**
   * Pauses execution and waits until the session to reach a specific state.
   *
   * @param state The target state to wait for.
   * @example
   * console.log('Waiting for the agent to finish planning...');
   * await session.waitFor('awaitingPlanApproval');
   * console.log('Plan is ready for review.');
   */
  waitFor(state: SessionState): Promise<void>;

  /**
   * Retrieves the latest state of the underlying session resource from the API.
   *
   * @returns The latest session data.
   * @example
   * const sessionInfo = await session.info();
   * console.log(`Current state: ${sessionInfo.state}`);
   */
  info(): Promise<SessionResource>;

  /**
   * Archives the session, hiding it from default lists and marking it as inactive.
   *
   * @example
   * await session.archive();
   */
  archive(): Promise<void>;

  /**
   * Unarchives the session, restoring it to the active list.
   *
   * @example
   * await session.unarchive();
   */
  unarchive(): Promise<void>;

  /**
   * Creates a point-in-time snapshot of the session with all activities loaded and derived analytics computed.
   * This is a network operation with cache heuristics.
   *
   * @param options Optional configuration for the snapshot.
   * @param options.activities If true, includes all activities in the snapshot. Defaults to true.
   * @returns A Promise resolving to the session snapshot.
   */
  snapshot(options?: { activities?: boolean }): Promise<SessionSnapshot>;
}

// -----------------------------------------------------------------------------
// Snapshot Types
// -----------------------------------------------------------------------------

/**
 * A point-in-time, immutable view of a session with all activities loaded and derived analytics computed.
 */
export interface SessionSnapshot {
  readonly id: string;
  readonly state: SessionState;
  readonly url: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly durationMs: number;
  readonly prompt: string;
  readonly title: string;
  readonly pr?: PullRequest;
  readonly activities: readonly Activity[];
  readonly activityCounts: Readonly<Record<string, number>>;
  readonly timeline: readonly TimelineEntry[];
  readonly insights: SessionInsights;
  readonly generatedFiles: GeneratedFiles;
  readonly changeSet: () => ChangeSet | undefined;
  toJSON(options?: ToJSONOptions): Partial<SerializedSnapshot>;
  toMarkdown(): string;
}

/**
 * An entry in the computed session timeline, representing a single activity.
 */
export interface TimelineEntry {
  readonly time: string;
  readonly type: string;
  readonly summary: string;
}

/**
 * Computed analytics and insights derived from the session's activities.
 */
export interface SessionInsights {
  readonly completionAttempts: number;
  readonly planRegenerations: number;
  readonly userInterventions: number;
  readonly failedCommands: readonly Activity[];
}

/**
 * Valid field names for the SerializedSnapshot, used for type-safe field masks.
 */
export type SnapshotField = keyof SerializedSnapshot;

/**
 * Options for controlling which fields are included in the serialized output.
 */
export interface ToJSONOptions {
  /**
   * Fields to include in the output. If specified, only these fields are returned.
   * Takes precedence over `exclude` if both are provided.
   */
  include?: SnapshotField[];
  /**
   * Fields to exclude from the output. Ignored if `include` is specified.
   */
  exclude?: SnapshotField[];
}

/**
 * The JSON-serializable representation of a SessionSnapshot.
 */
export interface SerializedSnapshot {
  id: string;
  state: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  durationMs: number;
  prompt: string;
  title: string;
  activities: Activity[];
  activityCounts: Record<string, number>;
  timeline: TimelineEntry[];
  generatedFiles: GeneratedFile[];
  insights: {
    completionAttempts: number;
    planRegenerations: number;
    userInterventions: number;
    failedCommandCount: number;
  };
  pr?: { url: string; title: string; description: string };
}

// -----------------------------------------------------------------------------
// SourceManager
// -----------------------------------------------------------------------------

/**
 * Interface for managing and locating connected sources.
 * Accessed via `jules.sources`.
 */
export interface SourceManager {
  /**
   * Iterates over all connected sources.
   * Uses an Async Iterator to abstract API pagination.
   *
   * @example
   * for await (const source of jules.sources()) {
   *   if (source.type === 'githubRepo') {
   *     console.log(`Found repo: ${source.githubRepo.owner}/${source.githubRepo.repo}`);
   *   }
   * }
   */
  (): AsyncIterable<Source>;

  /**
   * Locates a specific source based on ergonomic filters.
   *
   * @param filter The filter criteria (e.g., { github: 'owner/repo' }).
   * @returns The matching Source or undefined if not found.
   * @example
   * const myRepo = await jules.sources.get({ github: 'my-org/my-project' });
   */
  get(filter: { github: string }): Promise<Source | undefined>;
}

// -----------------------------------------------------------------------------
// Main Client Interface
// -----------------------------------------------------------------------------

/**
 * The main client interface for interacting with the Jules API.
 */
export interface JulesClient {
  /**
   * Executes a task in automated mode.
   * This is a high-level abstraction for "fire-and-forget" tasks.
   *
   * @param config The configuration for the run.
   * @returns A `AutomatedSession` object, which is an enhanced Promise that resolves to the final outcome.
   *
   * @example
   * const run = await jules.run({
   *   prompt: "Fix the bug described in issue #123",
   *   source: { github: 'my-org/my-project', baseBranch: 'main' }
   * });
   * // The session is now running in the background.
   * // You can optionally wait for the result:
   * // const outcome = await run.result();
   */
  run(config: SessionConfig): Promise<AutomatedSession>;

  /**
   * Creates a new interactive session for workflows requiring human oversight.
   *
   * @param config The configuration for the session.
   * @returns A Promise resolving to the interactive `SessionClient`.
   *
   * @example
   * const session = await jules.session({
   *   prompt: "Let's refactor the authentication module.",
   *   source: { github: 'my-org/my-project', baseBranch: 'develop' }
   * });
   */
  session(config: SessionConfig): Promise<SessionClient>;
  /**
   * Rehydrates an existing session from its ID, allowing you to resume interaction.
   *
   * @param sessionId The ID of the existing session.
   * @returns The interactive `SessionClient`.
   *
   * @example
   * const session = jules.session('EXISTING_SESSION_ID');
   * // now you can interact with it
   * const info = await session.info();
   */
  session(sessionId: string): SessionClient;

  /**
   * Provides access to the Source Management interface.
   *
   * @example
   * const sources = jules.sources;
   * const allSources = await Array.fromAsync(sources());
   */
  sources: SourceManager;

  /**
   * Creates a new Jules client instance with updated configuration.
   * This is an immutable operation; the original client instance remains unchanged.
   *
   * @param options The new configuration options to merge with the existing ones.
   * @returns A new JulesClient instance with the updated configuration.
   *
   * @example
   * const specialized = jules.with({ apiKey: 'NEW_KEY' });
   */
  with(options: JulesOptions): JulesClient;

  /**
   * Connects to the Jules service with the provided configuration.
   * Acts as a factory method for creating a new client instance.
   *
   * @param options Configuration options for the client.
   * @returns A new JulesClient instance.
   */
  connect(options: JulesOptions): JulesClient;

  /**
   * Lists sessions with a fluent, pagination-friendly API.
   *
   * @param options Configuration for pagination (pageSize, limit, pageToken)
   * @returns A SessionCursor that can be awaited (first page) or iterated (all pages).
   *
   * @example
   * // Get the first page
   * const page = await jules.sessions({ pageSize: 10 });
   *
   * // Stream all sessions
   * for await (const session of jules.sessions()) {
   *   console.log(session.id);
   * }
   */
  sessions(options?: ListSessionsOptions): SessionCursor;

  /**
   * Executes a batch of automated sessions in parallel, with concurrency control.
   *
   * @param items The raw data to process.
   * @param mapper A function that transforms each item into a `SessionConfig` object.
   * @param options Configuration for the batch operation.
   * @returns A Promise resolving to an array of `AutomatedSession` objects, preserving the order of the input items.
   *
   * @example
   * const todos = ['Fix login', 'Add tests'];
   * const sessions = await jules.all(todos, (task) => ({
   *   prompt: task,
   *   source: { github: 'user/repo', baseBranch: 'main' }
   * }));
   */
  all<T>(
    items: T[],
    mapper: (item: T) => SessionConfig | Promise<SessionConfig>,
    options?: {
      /**
       * The maximum number of concurrent sessions to run.
       * @default 4
       */
      concurrency?: number;
      /**
       * If true, the batch operation will stop immediately if any session fails to start.
       * If false, it will continue processing the remaining items.
       * @default true
       */
      stopOnError?: boolean;
      /**
       * The delay in milliseconds between starting each session.
       * @default 0
       */
      delayMs?: number;
    },
  ): Promise<AutomatedSession[]>;

  /**
   * Internal storage access for advanced queries.
   */
  readonly storage: SessionStorage;

  /**
   * Fluent API for rich local querying across sessions and activities.
   */
  select<T extends JulesDomain>(
    query: JulesQuery<T>,
  ): Promise<QueryResult<T>[]>;

  /**
   * Synchronizes the local cache with the authoritative API.
   * This is a "Reconciliation Engine" that ensures local data is consistent
   * with the server, enabling high-performance local queries.
   *
   * @param options Configuration for the sync job (depth, limit, concurrency).
   */
  sync(options?: SyncOptions): Promise<SyncStats>;
}

/**
 * Defines the depth of data ingestion.
 * - 'metadata': Only SessionResource fields (lightweight).
 * - 'activities': Full hydration including all event logs (heavyweight).
 */
export type SyncDepth = 'metadata' | 'activities';

/**
 * Progress updates for observability.
 */
export interface SyncProgress {
  phase:
    | 'fetching_list'
    | 'hydrating_records'
    | 'hydrating_activities'
    | 'checkpoint';
  current: number;
  total?: number;
  lastIngestedId?: string;
  activityCount?: number;
}

/**
 * Metrics resulting from a completed sync job.
 */
export interface SyncStats {
  sessionsIngested: number;
  activitiesIngested: number;
  isComplete: boolean;
  durationMs: number;
}

/**
 * Checkpoint data persisted between sync runs.
 */
export interface SyncCheckpoint {
  lastProcessedSessionId: string;
  sessionsProcessed: number;
  startedAt: string; // ISO timestamp
}

/**
 * Configuration for the Reconciliation Engine.
 */
export interface SyncOptions {
  /**
   * If set, syncs only this specific session.
   * Overrides `limit` and full-scan behavior.
   */
  sessionId?: string;
  /**
   * Maximum number of sessions to ingest in one pass.
   * @default 100
   */
  limit?: number;
  /**
   * Data depth per session.
   * @default 'metadata'
   */
  depth?: SyncDepth;
  /**
   * If true, stops when hitting a record already in the local cache.
   * @default true
   */
  incremental?: boolean;
  /**
   * Simultaneous hydration jobs. Use low values for SBCs/low bandwidth.
   * @default 3
   */
  concurrency?: number;
  /**
   * Optional callback for UI/CLI progress bars.
   */
  onProgress?: (progress: SyncProgress) => void;
  /**
   * If true, saves progress to disk and resumes from checkpoint on restart.
   * Checkpoint stored at .jules/cache/sync-checkpoint.json
   */
  checkpoint?: boolean;

  /**
   * AbortSignal to gracefully cancel the sync operation.
   * When aborted, sync returns partial stats with isComplete: false.
   * Does NOT throw an error.
   */
  signal?: AbortSignal;
}

/**
 * The main entry point for the Jules SDK.
 * This is a pre-initialized client that can be used immediately with default settings
 * (e.g., reading API keys from environment variables).
 *
 * @example
 * import { jules } from '@google/jules-sdk';
 * const session = await jules.session({ ... });
 */
export declare const jules: JulesClient;
