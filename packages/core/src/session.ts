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

// src/session.ts
import { DefaultActivityClient } from './activities/client.js';
import { ActivityClient, SelectOptions } from './activities/types.js';
import { ApiClient, ApiRequestOptions } from './api.js';
import { InternalConfig } from './client.js';
import { InvalidStateError, JulesError } from './errors.js';
import { mapSessionResourceToOutcome } from './mappers.js';
import { NetworkAdapter } from './network/adapter.js';
import { pollSession, pollUntilCompletion } from './polling.js';
import { ActivityStorage, SessionStorage } from './storage/types.js';
import { StreamActivitiesOptions } from './streaming.js';
import {
  Activity,
  ActivityAgentMessaged,
  GeneratedFile,
  SessionOutcome,
  SessionClient,
  SessionResource,
  SessionState,
} from './types.js';
import { isCacheValid } from './caching.js';
import { SessionSnapshotImpl } from './snapshot.js';
import { SessionSnapshot } from './types.js';

/**
 * Helper function to collect all items from an async iterable into an array.
 * @param iterable The async iterable to collect.
 * @returns A promise that resolves to an array of items.
 */
async function collectAsync<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

/**
 * Implementation of the SessionClient interface.
 * Manages an interactive session with the Jules agent.
 */
export class SessionClientImpl implements SessionClient {
  readonly id: string;
  private apiClient: ApiClient;
  private config: InternalConfig;
  private sessionStorage: SessionStorage; // Added property
  private _activities: ActivityClient;

  /**
   * Creates a new instance of SessionClientImpl.
   *
   * @param sessionId The ID of the session.
   * @param apiClient The API client to use for network requests.
   * @param config The configuration options.
   * @param activityStorage The storage engine for activities.
   * @param sessionStorage The storage engine for sessions.
   * @param platform The platform adapter.
   */
  constructor(
    sessionId: string,
    apiClient: ApiClient,
    config: InternalConfig,
    activityStorage: ActivityStorage,
    sessionStorage: SessionStorage, // Injected dependency
    platform: any,
  ) {
    this.id = sessionId.replace(/^sessions\//, '');
    this.apiClient = apiClient;
    this.config = config;
    this.sessionStorage = sessionStorage;

    // --- WIRING THE NEW ENGINE ---
    const network = new NetworkAdapter(
      this.apiClient,
      this.id,
      this.config.pollingIntervalMs,
      platform,
    );

    this._activities = new DefaultActivityClient(activityStorage, network);
  }

  // Private helper wrapper to enforce resume context
  private async request<T>(path: string, options: ApiRequestOptions = {}) {
    return this.apiClient.request<T>(path, options);
  }

  /**
   * COLD STREAM: Yields all known past activities from local storage.
   * If local cache is empty, fetches from network first.
   */
  history(): AsyncIterable<Activity> {
    return this._activities.history();
  }

  /**
   * Forces a full sync of activities from the network to local cache.
   * @returns The number of new activities synced.
   */
  hydrate(): Promise<number> {
    return this._activities.hydrate();
  }

  /**
   * HOT STREAM: Yields ONLY future activities as they arrive from the network.
   */
  updates(): AsyncIterable<Activity> {
    return this._activities.updates();
  }

  /**
   * LOCAL QUERY: Performs rich filtering against local storage only.
   *
   * @deprecated Use `session.activities.select()` instead.
   */
  select(options?: SelectOptions): Promise<Activity[]> {
    return this._activities.select(options);
  }

  /**
   * Scoped access to activity-specific operations.
   */
  public get activities() {
    return this._activities;
  }

  /**
   * Provides a real-time stream of activities for the session.
   *
   * @param options Options to control the stream.
   */
  async *stream(
    options: StreamActivitiesOptions = {},
  ): AsyncIterable<Activity> {
    // Proxy to the new engine, preserving legacy filtering options.
    // The base .stream() does not yet support filtering, so we do it here.
    for await (const activity of this._activities.stream()) {
      if (
        options.exclude?.originator &&
        activity.originator === options.exclude.originator
      ) {
        continue;
      }
      yield activity;
    }
  }

  /**
   * Approves the currently pending plan.
   * Only valid if the session state is `awaitingPlanApproval`.
   *
   * **Side Effects:**
   * - Sends a POST request to `sessions/{id}:approvePlan`.
   * - Transitions the session state from `awaitingPlanApproval` to `inProgress` (eventually).
   *
   * @throws {InvalidStateError} If the session is not in the `awaitingPlanApproval` state.
   *
   * @example
   * await session.waitFor('awaitingPlanApproval');
   * await session.approve();
   */
  async approve(): Promise<void> {
    // Don't pre-check state - just try the API call.
    // The API will return an error if the session is not in a valid state.
    // This handles "Inactive" sessions where API returns COMPLETED but
    // the session can still be resumed by approving the plan.
    await this.request(`sessions/${this.id}:approvePlan`, {
      method: 'POST',
      body: {},
    });
  }

  /**
   * Sends a message (prompt) to the agent in the context of the current session.
   * This is a fire-and-forget operation. To see the response, use `stream()` or `ask()`.
   *
   * **Side Effects:**
   * - Sends a POST request to `sessions/{id}:sendMessage`.
   * - Appends a new `userMessaged` activity to the session history.
   *
   * @param prompt The message to send.
   *
   * @example
   * await session.send("Please clarify step 2.");
   */
  async send(prompt: string): Promise<void> {
    await this.request(`sessions/${this.id}:sendMessage`, {
      method: 'POST',
      body: { prompt },
    });
  }

  /**
   * Sends a message to the agent and waits specifically for the agent's immediate reply.
   * This provides a convenient request/response flow for conversational interactions.
   *
   * **Behavior:**
   * - Sends the prompt using `send()`.
   * - Subscribes to the activity stream.
   * - Resolves with the first `agentMessaged` activity that appears *after* the prompt was sent.
   *
   * @param prompt The message to send.
   * @returns The agent's reply activity.
   * @throws {JulesError} If the session terminates before the agent replies.
   *
   * @example
   * const reply = await session.ask("What is the status?");
   * console.log(reply.message);
   */
  async ask(prompt: string): Promise<ActivityAgentMessaged> {
    const startTime = new Date();
    await this.send(prompt);

    // Don't return our own message.
    for await (const activity of this.stream({
      exclude: { originator: 'user' },
    })) {
      const activityTime = new Date(activity.createTime).getTime();
      const askTime = startTime.getTime();

      if (activityTime <= askTime) {
        continue;
      }

      if (activity.type === 'agentMessaged') {
        return activity;
      }

      if (
        activity.type === 'sessionCompleted' ||
        activity.type === 'sessionFailed'
      ) {
        throw new JulesError('Session ended before the agent replied.');
      }
    }

    throw new JulesError('Session ended before the agent replied.');
  }

  /**
   * Waits for the session to reach a terminal state and returns the result.
   *
   * **Behavior:**
   * - Polls the session API until state is 'completed' or 'failed'.
   * - Maps the final session resource to a friendly `Outcome` object.
   *
   * @param options Optional configuration for the operation.
   * @param options.timeoutMs Maximum time in milliseconds to wait for the session to complete.
   * @returns The final outcome of the session.
   * @throws {AutomatedSessionFailedError} If the session ends in a 'failed' state.
   * @throws {TimeoutError} If the operation times out.
   */
  async result(options?: { timeoutMs?: number }): Promise<SessionOutcome> {
    const finalSession = await pollUntilCompletion(
      this.id,
      this.apiClient,
      this.config.pollingIntervalMs,
      options?.timeoutMs,
    );
    // Write-Through: Persist final state
    await this.sessionStorage.upsert(finalSession);
    return mapSessionResourceToOutcome(finalSession);
  }

  /**
   * Pauses execution and waits until the session reaches a specific state.
   * Also returns if the session reaches a terminal state ('completed' or 'failed')
   * to prevent infinite waiting.
   *
   * **Behavior:**
   * - Polls the session API at the configured interval.
   * - Resolves immediately if the session is already in the target state (or terminal).
   *
   * @param targetState The target state to wait for.
   * @param options Optional configuration for the operation.
   * @param options.timeoutMs Maximum time in milliseconds to wait for the state.
   * @throws {TimeoutError} If the operation times out.
   *
   * @example
   * await session.waitFor('awaitingPlanApproval');
   */
  async waitFor(
    targetState: SessionState,
    options?: { timeoutMs?: number },
  ): Promise<void> {
    await pollSession(
      this.id,
      this.apiClient,
      (session) => {
        const state = session.state.toLowerCase();
        return (
          state === targetState.toLowerCase() ||
          state === 'completed' ||
          state === 'failed'
        );
      },
      this.config.pollingIntervalMs,
      options?.timeoutMs,
    );
  }

  /**
   * Retrieves the latest state of the underlying session resource.
   * Implements "Iceberg" Read-Through caching.
   */
  async info(): Promise<SessionResource> {
    let resource: SessionResource;
    const cached = await this.sessionStorage.get(this.id);

    if (isCacheValid(cached)) {
      resource = cached.resource;
    } else {
      // TIER 1: HOT (Network Fetch)
      try {
        resource = await this.request<SessionResource>(`sessions/${this.id}`);
        await this.sessionStorage.upsert(resource);
      } catch (e: any) {
        if (e.status === 404 && cached) {
          await this.sessionStorage.delete(this.id);
        }
        throw e;
      }
    }

    // Single place for outcome mapping - always runs regardless of cache/network path
    resource.outcome = mapSessionResourceToOutcome(resource);
    return resource;
  }

  /**
   * Creates a point-in-time snapshot of the session.
   * This is a network operation that fetches the latest session info and all activities.
   *
   * @param options Optional configuration for the snapshot.
   * @param options.activities If true, includes all activities in the snapshot. Defaults to true.
   * @returns A `SessionSnapshot` instance.
   */
  async snapshot(options?: { activities?: boolean }): Promise<SessionSnapshot> {
    const includeActivities = options?.activities ?? true;
    const [info, activities] = await Promise.all([
      this.info(),
      includeActivities ? collectAsync(this.history()) : [],
    ]);
    return new SessionSnapshotImpl({ data: { session: info, activities } });
  }
}
