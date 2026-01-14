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

import {
  MediaArtifact,
  BashArtifact,
  ChangeSetArtifact,
} from '../artifacts.js';
import { Activity, Artifact } from '../types.js';
import { ActivityStorage } from '../storage/types.js';
import { ActivityClient, ListOptions, SelectOptions } from './types.js';
import { isSessionFrozen } from '../utils/page-token.js';

/**
 * Creates a filter string for the Jules API to fetch activities
 * after a given timestamp.
 *
 * @param createTime - The RFC 3339 timestamp.
 * @returns A filter string for the API.
 */
function createTimeFilter(createTime: string): string {
  return `create_time>"${createTime}"`;
}

/**
 * Interface for the network layer used by the activity client.
 * Abstracts away the details of polling and fetching from the API.
 * @internal
 */
export interface NetworkClient {
  rawStream(): AsyncIterable<Activity>;
  listActivities(
    options?: ListOptions,
  ): Promise<{ activities: Activity[]; nextPageToken?: string }>;
  fetchActivity(activityId: string): Promise<Activity>;
}

/**
 * The default implementation of the ActivityClient.
 * Implements a "local-first" architecture where activities are fetched from
 * the network, cached locally, and then served from the cache.
 */
export class DefaultActivityClient implements ActivityClient {
  constructor(
    private storage: ActivityStorage,
    private network: NetworkClient,
  ) {}

  /**
   * Re-hydrates plain artifact objects from storage into rich class instances.
   * JSON serialization loses class information (methods), so we need to restore it.
   *
   * **Behavior:**
   * - Iterates through artifacts in an activity.
   * - If an artifact is a plain object (not a class instance), it's re-instantiated.
   * - Handles backward compatibility: if an artifact is already a class instance, it's skipped.
   *
   * @param activity The activity from storage, potentially with plain artifacts.
   * @returns The same activity with its artifacts guaranteed to be class instances.
   */
  private _hydrateActivityArtifacts(activity: Activity): Activity {
    if (!activity.artifacts || activity.artifacts.length === 0) {
      return activity;
    }

    const hydratedArtifacts = activity.artifacts.map((artifact) => {
      // If it's already a class instance, we're done.
      if (artifact instanceof MediaArtifact) return artifact;
      if (artifact instanceof BashArtifact) return artifact;
      if (artifact instanceof ChangeSetArtifact) return artifact;

      // It's a plain object from JSON.parse(), so we need to re-hydrate it.
      // We check for the 'type' property to know which class to use.
      switch (artifact.type) {
        case 'changeSet':
          // The raw cached format has artifact.changeSet.gitPatch structure.
          // We need to handle this legacy format gracefully.
          const rawChangeSet = (artifact as any).changeSet || artifact;
          return new ChangeSetArtifact(
            rawChangeSet.source,
            rawChangeSet.gitPatch,
          );
        case 'bashOutput':
          // The raw cached format has artifact.bashOutput
          const rawBashOutput = (artifact as any).bashOutput || artifact;
          return new BashArtifact(rawBashOutput);
        case 'media':
          // TODO: MediaArtifact requires the platform object for some methods.
          // However, for local cache re-hydration, we don't have access to it here.
          // For now, we accept this limitation as the primary bug is with ChangeSetArtifact.
          // A future refactor could pass the platform object down.
          const rawMedia = (artifact as any).media || artifact;
          return new MediaArtifact(rawMedia, {} as any, activity.id);
        default:
          // If we don't recognize the type, return it as-is.
          return artifact as Artifact;
      }
    });

    return {
      ...activity,
      artifacts: hydratedArtifacts,
    };
  }

  /**
   * Returns an async iterable of all activities.
   *
   * **Behavior:**
   * - Always syncs new activities from the network first (via hydrate).
   * - Then yields all activities from local storage.
   *
   * This ensures callers always get the complete, up-to-date history
   * rather than potentially stale cached data.
   */
  async *history(): AsyncIterable<Activity> {
    // Always sync new activities from network before yielding.
    // This fixes the stale cache bug where history() would return
    // outdated data if the cache was populated earlier.
    await this.hydrate();

    // Now yield all activities from storage (including newly synced ones)
    for await (const activity of this.storage.scan()) {
      yield this._hydrateActivityArtifacts(activity);
    }
  }

  /**
   * Syncs new activities from the network to local cache.
   *
   * **Optimization Strategy:**
   * Activities are immutable - once downloaded, they never change.
   * We use the Jules API's pageToken (nanosecond timestamp) to fetch
   * only activities newer than our latest cached one.
   *
   * **Behavior:**
   * - Empty cache: Fetches all activities (no pageToken)
   * - Has cached activities: Constructs pageToken from latest createTime,
   *   fetches only newer activities
   * - Frozen session (> 30 days): Skips API call entirely
   *
   * @returns The number of new activities synced.
   */
  async hydrate(): Promise<number> {
    await this.storage.init();

    // 1. Check for cached activities and establish high-water mark
    const latest = await this.storage.latest();

    // 2. Frozen session optimization: If the last activity is older than
    // 30 days, the session is frozen and no new activities will appear.
    if (latest?.createTime && isSessionFrozen(latest.createTime)) {
      return 0; // No API call needed
    }

    // 3. Construct filter from latest cached activity's createTime.
    // This tells the API to return only activities AFTER this timestamp.
    // If no cached activities, filter is undefined (fetch from beginning).
    const filter = latest?.createTime
      ? createTimeFilter(latest.createTime)
      : undefined;

    let count = 0;
    let nextPageToken: string | undefined;

    do {
      const response = await this.network.listActivities({
        filter,
        pageToken: nextPageToken,
      });

      for (const activity of response.activities) {
        // The API filter should prevent us from receiving activities we already
        // have. This is a defensive check to prevent duplicates in case of
        // API or clock-skew issues.
        const existing = await this.storage.get(activity.id);
        if (existing) {
          continue;
        }

        // It's new - append to storage
        await this.storage.append(activity);
        count++;
      }

      nextPageToken = response.nextPageToken;
    } while (nextPageToken);

    return count;
  }

  /**
   * Returns an async iterable of new activities from the network.
   * This method polls the network and updates the local storage.
   *
   * **Side Effects:**
   * - Polls the network continuously.
   * - Appends new activities to local storage (write-through caching).
   *
   * **Logic:**
   * - Reads the latest activity from storage to determine the "high-water mark".
   * - Ignores incoming activities older than or equal to the high-water mark.
   */
  async *updates(): AsyncIterable<Activity> {
    await this.storage.init();

    // 1. Establish High-Water Mark
    // We only want events strictly NEWER than the last one we successfully stored.
    const latest = await this.storage.latest();
    // We use createTime as the primary cursor because it's standard and comparable.
    // Fallback to epoch 0 if storage is empty.
    let highWaterMark = latest?.createTime
      ? new Date(latest.createTime).getTime()
      : 0;
    // We also track the specific ID of the latest to handle events with identical timestamps.
    let lastSeenId = latest?.id;

    // 2. Start crude polling from the raw network source
    for await (const activity of this.network.rawStream()) {
      const actTime = new Date(activity.createTime).getTime();

      // 3. Deduplication Filter
      // If this activity is older than our high-water mark, skip it.
      if (actTime < highWaterMark) {
        continue;
      }

      // If it has the exact same time, we need to check IDs to avoid double-processing
      // the exact same event we used as our mark.
      if (actTime === highWaterMark && activity.id === lastSeenId) {
        continue;
      }

      // 4. It's new! Persist it FIRST for crash consistency.
      await this.storage.append(activity);

      // 5. Update our in-memory watermarks
      highWaterMark = actTime;
      lastSeenId = activity.id;

      // 6. Yield to the application
      yield activity;
    }
  }

  /**
   * Returns a combined stream of history and updates.
   * This is the primary method for consuming the activity stream.
   *
   * **Behavior:**
   * 1. Yields all historical activities from local storage (offline capable).
   * 2. Switches to `updates()` to yield new activities from the network (real-time).
   */
  async *stream(): AsyncIterable<Activity> {
    // The Hybrid is just a composition of the two modalities.
    // 1. Yield everything we already know safely from disk.
    yield* this.history();

    // 2. Switch to watching for new things.
    // Because updates() re-initializes its highWaterMark when called,
    // it will correctly pick up exactly where history() ended.
    yield* this.updates();
  }

  /**
   * Queries local storage for activities matching the given options.
   */
  async select(options: SelectOptions = {}): Promise<Activity[]> {
    await this.storage.init();
    const results: Activity[] = [];

    // State machine flags for cursor handling
    let started = !options.after; // If no 'after', start immediately
    let count = 0;

    for await (const act of this.storage.scan()) {
      // 1. Handle 'after' cursor (exclusive)
      if (!started) {
        if (act.id === options.after) {
          started = true;
        }
        continue;
      }

      // 2. Handle 'before' cursor (exclusive)
      if (options.before && act.id === options.before) {
        break;
      }

      // 3. Apply filters
      if (options.type && act.type !== options.type) {
        continue;
      }

      // 4. Collect result
      results.push(this._hydrateActivityArtifacts(act));
      count++;

      // 5. Check limits
      if (options.limit && count >= options.limit) {
        break;
      }
    }

    return results;
  }

  /**
   * Lists activities from the network directly.
   * @param options Pagination options.
   */
  async list(
    options?: ListOptions,
  ): Promise<{ activities: Activity[]; nextPageToken?: string }> {
    return this.network.listActivities(options);
  }

  /**
   * Gets a single activity by ID.
   * Implements a "read-through" caching strategy.
   *
   * **Logic:**
   * 1. Checks local storage. If found, returns it immediately (fast).
   * 2. If missing, fetches from the network.
   * 3. Persists the fetched activity to storage (future reads will hit cache).
   * 4. Returns the activity.
   *
   * **Side Effects:**
   * - May perform a network request.
   * - May write to local storage.
   */
  async get(activityId: string): Promise<Activity> {
    await this.storage.init();

    // 1. Try cache first (Aggressive Caching)
    const cached = await this.storage.get(activityId);
    if (cached) {
      return this._hydrateActivityArtifacts(cached);
    }

    // 2. Network fallback (Read-Through)
    const fresh = await this.network.fetchActivity(activityId);

    // 3. Persist for next time before returning
    // We await this to guarantee consistency.
    await this.storage.append(fresh);

    // No need to hydrate 'fresh' as it comes directly from the network mapper
    // which already creates class instances.
    return fresh;
  }
}
