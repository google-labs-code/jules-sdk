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

import { Activity } from '../types.js';

/**
 * Standard pagination options for network requests.
 */
export interface ListOptions {
  pageSize?: number;
  pageToken?: string;
  filter?: string;
}

/**
 * Options for filtering activities locally.
 */
export interface SelectOptions {
  after?: string; // Activity ID
  before?: string; // Activity ID
  type?: string; // Activity Type
  limit?: number;
  order?: 'asc' | 'desc';
}

/**
 * Interface for managing session activities.
 * This interface handles both local caching and network synchronization.
 */
export interface ActivityClient {
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
   * HYBRID STREAM: Yields full history(), then seamlessly switches to updates().
   * The standard choice for most applications.
   */
  stream(): AsyncIterable<Activity>;

  /**
   * LOCAL QUERY: Performs rich filtering against local storage only.
   * Fast, but might be incomplete if not synced.
   */
  select(options?: SelectOptions): Promise<Activity[]>;

  /**
   * NETWORK LIST: Honest wrapper around standard REST pagination.
   * Uses opaque tokens.
   */
  list(
    options?: ListOptions,
  ): Promise<{ activities: Activity[]; nextPageToken?: string }>;

  /**
   * NETWORK GET: Fetches a specific activity from the network and caches it.
   */
  get(activityId: string): Promise<Activity>;

  /**
   * NETWORK SYNC: Fetches all activities from the network and caches them.
   * Useful when you suspect the cache is stale.
   * @returns The number of activities synced.
   */
  hydrate(): Promise<number>;
}
