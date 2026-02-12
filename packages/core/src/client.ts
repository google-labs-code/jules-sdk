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

// src/client.ts
import { ApiClient } from './api.js';
import { createSourceManager } from './sources.js';
import { join } from 'node:path';
import { getRootDir } from './storage/root.js';
import {
  JulesClient,
  JulesOptions,
  SessionConfig,
  SourceManager,
  AutomatedSession,
  SessionClient,
  SessionOutcome,
  SessionResource,
  StorageFactory,
} from './types.js';
import { SourceNotFoundError, SyncInProgressError } from './errors.js';
import { streamActivities } from './streaming.js';
import { pollUntilCompletion } from './polling.js';
import { mapSessionResourceToOutcome } from './mappers.js';
import { SessionClientImpl } from './session.js';
import { pMap } from './utils.js';
import { SessionCursor, ListSessionsOptions } from './sessions.js';
import { Platform } from './platform/types.js';
import { SessionStorage } from './storage/types.js';
import { isCacheValid } from './caching.js';
import { updateGlobalCacheMetadata } from './storage/cache-info.js';
import { select as modularSelect } from './query/select.js';
import {
  JulesQuery,
  JulesDomain,
  QueryResult,
  SyncCheckpoint,
  SyncOptions,
  SyncStats,
} from './types.js';

/**
 * The fully resolved internal configuration for the SDK.
 * @internal
 */
export type InternalConfig = {
  pollingIntervalMs: number;
  requestTimeoutMs: number;
};

/**
 * Implementation of the main JulesClient interface.
 * This class acts as the central hub for creating and managing sessions,
 * as well as accessing other resources like sources.
 */
export class JulesClientImpl implements JulesClient {
  /**
   * Manages source connections (e.g., GitHub repositories).
   */
  public sources: SourceManager;
  // Expose storage for modular functions (Phase 3 requirement)
  public readonly storage: SessionStorage;

  private apiClient: ApiClient;
  private config: InternalConfig;
  private options: JulesOptions;
  private storageFactory: StorageFactory;
  private platform: Platform;

  /**
   * Lock to prevent concurrent sync operations.
   * Using a simple boolean for in-process locking.
   */
  private syncInProgress: boolean = false;

  /**
   * Creates a new instance of the JulesClient.
   *
   * @param options Configuration options for the client.
   * @param defaultStorageFactory Factory for creating storage instances.
   * @param defaultPlatform Platform-specific implementation.
   */
  constructor(
    options: JulesOptions = {},
    defaultStorageFactory: StorageFactory,
    defaultPlatform: Platform,
  ) {
    this.options = options;
    this.storageFactory = options.storageFactory ?? defaultStorageFactory;
    this.platform = options.platform ?? defaultPlatform;

    // Phase 1 / Phase 2 Integration: Initialize Session Storage
    // NOTE: This assumes StorageFactory was updated to { activity: ..., session: ... } in Phase 1
    this.storage = this.storageFactory.session();

    const apiKey =
      options.apiKey_TEST_ONLY_DO_NOT_USE_IN_PRODUCTION ??
      options.apiKey ??
      this.platform.getEnv('JULES_API_KEY');
    const baseUrl = options.baseUrl ?? 'https://jules.googleapis.com/v1alpha';

    // Apply defaults to the user-provided config
    this.config = {
      pollingIntervalMs: options.config?.pollingIntervalMs ?? 5000,
      requestTimeoutMs: options.config?.requestTimeoutMs ?? 30000,
    };

    this.apiClient = new ApiClient({
      apiKey,
      baseUrl,
      requestTimeoutMs: this.config.requestTimeoutMs,
      rateLimitRetry: options.config?.rateLimitRetry,
    });
    this.sources = createSourceManager(this.apiClient);
  }

  /**
   * Fluent API for rich local querying across sessions and activities.
   * This method uses the modular query engine internally.
   */
  async select<T extends JulesDomain>(
    query: JulesQuery<T>,
  ): Promise<QueryResult<T>[]> {
    // Pass 'this' to the modular function.
    // Bundlers can still tree-shake if this method is never called.
    return modularSelect(this, query);
  }

  /**
   * Synchronizes local state with the server.
   * Logic:
   * 1. Find High-Water Mark (newest local record).
   * 2. Stream latest sessions from API.
   * 3. Terminate stream early if 'incremental' and High-Water Mark is hit.
   * 4. Throttled hydration of activities if depth is 'activities'.
   */
  async sync(options: SyncOptions = {}): Promise<SyncStats> {
    // Acquire lock
    if (this.syncInProgress) {
      throw new SyncInProgressError();
    }

    this.syncInProgress = true;

    try {
      const startTime = Date.now();
      const {
        sessionId,
        limit = 100,
        depth = 'metadata',
        incremental = true,
        concurrency = 3,
        onProgress,
        checkpoint: useCheckpoint = false,
        signal,
      } = options;

      let wasAborted = false; // Track if we aborted
      const candidates: SessionResource[] = [];
      let activitiesIngested = 0;
      let sessionsIngestedThisRun = 0;

      // CTRL-07: Targeted Sync Logic
      if (sessionId) {
        // For a targeted sync, we always fetch from the network, bypassing normal cache checks.
        const session = await this.apiClient.request<SessionResource>(
          `sessions/${sessionId}`,
        );
        // We still upsert to update the cache with the fresh data.
        await this.storage.upsert(session);
        candidates.push(session);
        sessionsIngestedThisRun = 1; // We synced one session.
      } else {
        // CTRL-08: Full Sync Logic (existing behavior)
        let resumeFromId: string | null = null;
        let startingCount = 0;

        if (useCheckpoint) {
          const ckpt = await this.loadCheckpoint();
          if (ckpt) {
            resumeFromId = ckpt.lastProcessedSessionId;
            startingCount = ckpt.sessionsProcessed;
          }
        }

        let skipUntilPast = !!resumeFromId;
        const highWaterMark = incremental
          ? await this._getHighWaterMark()
          : null;

        const cursor = this.sessions({
          pageSize: Math.min(limit, 100),
          persist: false,
        });

        onProgress?.({ phase: 'fetching_list', current: 0 });

        for await (const session of cursor) {
          // Check for abort BEFORE processing each session
          if (signal?.aborted) {
            wasAborted = true;
            break;
          }

          if (skipUntilPast) {
            if (session.id === resumeFromId) {
              skipUntilPast = false;
              continue;
            }
            continue;
          }

          if (highWaterMark && new Date(session.createTime) <= highWaterMark) {
            // We've reached sessions we already have cached.
            // For activities depth: include this session for hydration (to get new activities)
            // but stop iterating after - we don't need to process older sessions.
            if (depth === 'activities') {
              await this.storage.upsert(session);
              candidates.push(session);
              // Don't increment sessionsIngested - this is an existing session
            }
            // For both depths, stop iterating - the hydrate() method uses pageToken
            // to efficiently fetch only NEW activities for cached sessions.
            break;
          }

          await this.storage.upsert(session);
          candidates.push(session);
          sessionsIngestedThisRun++;

          if (useCheckpoint) {
            await this.saveCheckpoint({
              lastProcessedSessionId: session.id,
              sessionsProcessed: startingCount + sessionsIngestedThisRun,
              startedAt: new Date(startTime).toISOString(),
            });
          }

          onProgress?.({
            phase: 'fetching_list',
            current: sessionsIngestedThisRun,
            lastIngestedId: session.id,
          });

          if (candidates.length >= limit) break;
        }
      }

      // 3. Deep Ingestion (Activity Hydration)
      // Uses pMap for backpressure to prevent quota saturation.
      // The hydrate() method is optimized to:
      // - Skip frozen sessions (> 30 days old) entirely
      // - Use pageToken to fetch only new activities
      // - Handle duplicate detection at timestamp boundaries
      if (depth === 'activities' && candidates.length > 0 && !wasAborted) {
        let hydratedCount = 0;
        onProgress?.({
          phase: 'hydrating_records',
          current: 0,
          total: candidates.length,
        });

        await pMap(
          candidates,
          async (session) => {
            if (signal?.aborted) return; // Skip if aborted

            const sessionClient = this.session(session.id);
            // hydrate() handles all the optimization:
            // - Frozen sessions (> 30 days) return 0 immediately
            // - Uses pageToken for incremental sync
            const count = await sessionClient.activities.hydrate();
            activitiesIngested += count;

            hydratedCount++;
            onProgress?.({
              phase: 'hydrating_records',
              current: hydratedCount,
              total: candidates.length,
              lastIngestedId: session.id,
              activityCount: count,
            });
          },
          { concurrency },
        );
      }

      // Clear checkpoint on successful completion (only if not aborted and not targeted)
      if (useCheckpoint && !wasAborted && !sessionId) {
        await this.clearCheckpoint();
      }

      const stats = {
        sessionsIngested: sessionsIngestedThisRun,
        activitiesIngested,
        isComplete: !wasAborted, // false if aborted
        durationMs: Date.now() - startTime,
      };

      await updateGlobalCacheMetadata();

      return stats;
    } finally {
      // ALWAYS release lock, even on error
      this.syncInProgress = false;
    }
  }

  private getCheckpointPath(): string {
    // Assumes storage has a way to get the cache directory
    // Or use getRootDir() from index.ts
    return join(getRootDir(), '.jules', 'cache', 'sync-checkpoint.json');
  }

  private async loadCheckpoint(): Promise<SyncCheckpoint | null> {
    if (!this.platform.readFile) return null;
    try {
      const path = this.getCheckpointPath();
      const data = await this.platform.readFile(path);
      return JSON.parse(data) as SyncCheckpoint;
    } catch {
      return null; // No checkpoint or invalid
    }
  }

  private async saveCheckpoint(checkpoint: SyncCheckpoint): Promise<void> {
    if (!this.platform.writeFile) return;
    const path = this.getCheckpointPath();
    await this.platform.writeFile(path, JSON.stringify(checkpoint, null, 2));
  }

  private async clearCheckpoint(): Promise<void> {
    if (!this.platform.deleteFile) return;
    try {
      const path = this.getCheckpointPath();
      await this.platform.deleteFile(path);
    } catch {
      // Ignore if doesn't exist
    }
  }

  private async _getHighWaterMark(): Promise<Date | null> {
    let newest: Date | null = null;
    // scanIndex is the high-speed index scanner implemented in Phase 1
    for await (const entry of this.storage.scanIndex()) {
      const date = new Date(entry.createTime);
      if (!newest || date > newest) newest = date;
    }
    return newest;
  }

  /**
   * Helper to resolve environment variables with support for frontend prefixes.
   */
  private getEnv(key: string): string | undefined {
    return (
      this.platform.getEnv(`NEXT_PUBLIC_${key}`) ||
      this.platform.getEnv(`REACT_APP_${key}`) ||
      this.platform.getEnv(`VITE_${key}`) ||
      this.platform.getEnv(key)
    );
  }

  /**
   * Creates a new Jules client instance with updated configuration.
   * This is an immutable operation; the original client instance remains unchanged.
   *
   * @param options The new configuration options to merge with the existing ones.
   * @returns A new JulesClient instance with the updated configuration.
   */
  with(options: JulesOptions): JulesClient {
    return new JulesClientImpl(
      {
        ...this.options,
        ...options,
        config: {
          ...this.options.config,
          ...options.config,
        },
      },
      this.storageFactory,
      this.platform,
    );
  }

  /**
   * Connects to the Jules service with the provided configuration.
   * Acts as a factory method for creating a new client instance.
   *
   * @param options Configuration options for the client.
   * @returns A new JulesClient instance.
   */
  connect(options: JulesOptions): JulesClient {
    return new JulesClientImpl(
      {
        ...this.options,
        ...options,
      },
      this.storageFactory,
      this.platform,
    );
  }

  /**
   * Retrieves a session resource using the "Iceberg" caching strategy.
   * * - **Tier 3 (Frozen):** > 30 days old. Returns from cache immediately.
   * - **Tier 2 (Warm):** Terminal state + Verified < 24h ago. Returns from cache.
   * - **Tier 1 (Hot):** Active or Stale. Fetches from network, updates cache, returns.
   */
  async getSessionResource(id: string): Promise<SessionResource> {
    const cached = await this.storage.get(id);

    if (isCacheValid(cached)) {
      return cached.resource;
    }

    // TIER 1 & Fallback: Network Request
    try {
      const fresh = await this.apiClient.request<SessionResource>(
        `sessions/${id}`,
      );

      await this.storage.upsert(fresh);

      return fresh;
    } catch (e: any) {
      // Handle 404: If it was in cache but 404s on network, it was deleted remotely.
      if (e.status === 404 && cached) {
        await this.storage.delete(id);
      }
      throw e;
    }
  }

  /**
   * Lists sessions with a fluent, pagination-friendly API.
   * @param options Configuration for pagination (pageSize, limit, pageToken)
   * @returns A SessionCursor that can be awaited (first page) or iterated (all pages).
   */
  sessions(options?: ListSessionsOptions): SessionCursor {
    // Inject storage into the cursor for Write-Through behavior
    return new SessionCursor(this.apiClient, this.storage, options);
  }

  async all<T>(
    items: T[],
    mapper: (item: T) => SessionConfig | Promise<SessionConfig>,
    options?: {
      concurrency?: number;
      stopOnError?: boolean;
      delayMs?: number;
    },
  ): Promise<AutomatedSession[]> {
    return pMap(
      items,
      async (item) => {
        const config = await mapper(item);
        return this.run(config);
      },
      options,
    );
  }

  private async _prepareSessionCreation(
    config: SessionConfig,
  ): Promise<object> {
    // For repoless sessions, source is not provided
    if (!config.source) {
      return {
        prompt: config.prompt,
        title: config.title,
      };
    }

    const source = await this.sources.get({ github: config.source.github });
    if (!source) {
      throw new SourceNotFoundError(config.source.github);
    }

    return {
      prompt: config.prompt,
      title: config.title,
      sourceContext: {
        source: source.name,
        githubRepoContext: {
          startingBranch: config.source.baseBranch,
        },
      },
    };
  }

  /**
   * Executes a task in automated mode.
   * This is a high-level abstraction for "fire-and-forget" tasks.
   *
   * **Side Effects:**
   * - Creates a new session on the Jules API (`POST /sessions`).
   * - Initiates background polling for activity updates.
   * - May create a Pull Request if `autoPr` is true (default).
   *
   * **Data Transformation:**
   * - Resolves the `github` source identifier (e.g., `owner/repo`) to a full resource name.
   * - Defaults `requirePlanApproval` to `false` for automated runs.
   *
   * @param config The configuration for the run.
   * @returns A `AutomatedSession` object, which is an enhanced Promise that resolves to the final outcome.
   * @throws {SourceNotFoundError} If the specified GitHub repository cannot be found or accessed.
   * @throws {JulesApiError} If the session creation fails (e.g., 401 Unauthorized).
   *
   * @example
   * const run = await jules.run({
   *   prompt: "Fix the login bug",
   *   source: { github: "my-org/repo", baseBranch: "main" }
   * });
   * const outcome = await run.result();
   */
  async run(config: SessionConfig): Promise<AutomatedSession> {
    const body = await this._prepareSessionCreation(config);
    const sessionResource = await this.apiClient.request<SessionResource>(
      'sessions',
      {
        method: 'POST',
        body: {
          ...body,
          automationMode:
            config.autoPr === false
              ? 'AUTOMATION_MODE_UNSPECIFIED'
              : 'AUTO_CREATE_PR',
          requirePlanApproval: config.requireApproval ?? false,
        },
      },
    );

    // Cache the new session immediately
    await this.storage.upsert(sessionResource);

    const sessionId = sessionResource.id;

    return {
      id: sessionId,
      stream: async function* (this: JulesClientImpl) {
        yield* streamActivities(
          sessionId,
          this.apiClient,
          this.config.pollingIntervalMs,
          this.platform,
        );
      }.bind(this),
      result: async (options?: { timeoutMs?: number }) => {
        const finalSession = await pollUntilCompletion(
          sessionId,
          this.apiClient,
          this.config.pollingIntervalMs,
          options?.timeoutMs,
        );
        // Cache the final state
        await this.storage.upsert(finalSession);
        return mapSessionResourceToOutcome(finalSession);
      },
    };
  }

  /**
   * Creates a new interactive session for workflows requiring human oversight.
   *
   * **Side Effects:**
   * - Creates a new session on the Jules API (`POST /sessions`).
   * - Initializes local storage for the session.
   *
   * **Data Transformation:**
   * - Defaults `requirePlanApproval` to `true` for interactive sessions.
   *
   * @param config The configuration for the session.
   * @returns A Promise resolving to the interactive `SessionClient`.
   * @throws {SourceNotFoundError} If the source cannot be found.
   *
   * @example
   * const session = await jules.session({
   *   prompt: "Let's explore the codebase",
   *   source: { github: "owner/repo", baseBranch: "main" }
   * });
   */
  session(config: SessionConfig): Promise<SessionClient>;
  /**
   * Rehydrates an existing session from its ID, allowing you to resume interaction.
   * This is useful for stateless environments (like serverless functions) where you need to
   * reconnect to a long-running session.
   *
   * **Side Effects:**
   * - Initializes local storage for the existing session ID.
   * - Does NOT make a network request immediately (lazy initialization).
   *
   * @param sessionId The ID of the existing session.
   * @returns The interactive `SessionClient`.
   *
   * @example
   * const session = jules.session("12345");
   * const info = await session.info(); // Now makes a request
   */
  session(sessionId: string): SessionClient;
  session(
    configOrId: SessionConfig | string,
  ): Promise<SessionClient> | SessionClient {
    if (typeof configOrId === 'string') {
      const storage = this.storageFactory.activity(configOrId);
      return new SessionClientImpl(
        configOrId,
        this.apiClient,
        this.config,
        storage,
        this.storage,
        this.platform,
      );
    }

    const config = configOrId;
    const sessionPromise = (async () => {
      const body = await this._prepareSessionCreation(config);
      const session = await this.apiClient.request<SessionResource>(
        'sessions',
        {
          method: 'POST',
          body: {
            ...body,
            automationMode:
              config.autoPr === true
                ? 'AUTO_CREATE_PR'
                : 'AUTOMATION_MODE_UNSPECIFIED',
            requirePlanApproval: config.requireApproval ?? true,
          },
        },
      );

      // Cache created session
      await this.storage.upsert(session);

      const activityStorage = this.storageFactory.activity(session.id);
      return new SessionClientImpl(
        session.name,
        this.apiClient,
        this.config,
        activityStorage,
        this.storage,
        this.platform,
      );
    })();
    return sessionPromise;
  }
}
