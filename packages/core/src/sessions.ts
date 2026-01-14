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

import { ApiClient } from './api.js';
import { SessionResource } from './types.js';
import { SessionStorage } from './storage/types.js';

export type ListSessionsOptions = {
  pageSize?: number;
  pageToken?: string;
  /**
   * Hard limit on the number of items to yield when iterating.
   * Useful if you want "The last 50" without manual counting.
   */
  limit?: number;
  /**
   * Whether to persist fetched sessions to local storage.
   * Defaults to `true` (Write-Through Caching).
   * Set to `false` to disable side effects.
   */
  persist?: boolean;
};

export type ListSessionsResponse = {
  sessions: SessionResource[];
  nextPageToken?: string;
};

/**
 * The SessionCursor handles the complexity of pagination state.
 * It is "Thenable" (acts like a Promise) and "AsyncIterable".
 *
 * This allows two usage patterns:
 * 1. `await jules.sessions()` - Get the first page (Promise behavior).
 * 2. `for await (const session of jules.sessions())` - Stream all sessions (AsyncIterable behavior).
 *
 * **Design Notes:**
 * - **Pagination:** Handles `nextPageToken` automatically during iteration. For manual control,
 *   access the `nextPageToken` property on the promised response.
 * - **Limiting:** The `limit` option hard-stops the iteration after N items, preventing over-fetching.
 * - **Write-Through Caching:** Fetched sessions are automatically persisted to local storage
 *   using `storage.upsertMany()`. This ensures the local graph is populated during listing.
 * - **Platform:** Fully platform-agnostic (Node.js/Browser/GAS) via the injected `ApiClient`.
 */
export class SessionCursor
  implements PromiseLike<ListSessionsResponse>, AsyncIterable<SessionResource>
{
  constructor(
    private apiClient: ApiClient,
    private storage: SessionStorage,
    private options: ListSessionsOptions = {},
  ) {}

  /**
   * DX Feature: Promise Compatibility.
   * Allows `const page = await jules.sessions()` to just get the first page.
   * This is great for UIs that render a list and a "Load More" button.
   */
  then<TResult1 = ListSessionsResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: ListSessionsResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    // When used as a promise, we default to the pageToken from options
    return this.fetchPage(this.options.pageToken).then(onfulfilled, onrejected);
  }

  /**
   * DX Feature: Async Iterator.
   * Allows `for await (const s of jules.sessions())` to stream ALL items.
   * Automatically handles page tokens and fetching behind the scenes.
   */
  async *[Symbol.asyncIterator](): AsyncIterator<SessionResource> {
    let currentToken = this.options.pageToken;
    let itemCount = 0;
    const limit = this.options.limit ?? Infinity;

    do {
      // Check limit before fetching a whole new page
      if (itemCount >= limit) break;

      const response = await this.fetchPage(currentToken);

      // If no sessions returned, break
      if (!response.sessions || response.sessions.length === 0) {
        break;
      }

      for (const session of response.sessions) {
        if (itemCount >= limit) break;
        yield session;
        itemCount++;
      }

      currentToken = response.nextPageToken;
    } while (currentToken);
  }

  /**
   * Helper to fetch all pages into a single array.
   * WARNING: Use with caution on large datasets.
   */
  async all(): Promise<SessionResource[]> {
    const results: SessionResource[] = [];
    for await (const session of this) {
      results.push(session);
    }
    return results;
  }

  /**
   * Internal fetcher that maps the options to the REST parameters.
   */
  private async fetchPage(pageToken?: string): Promise<ListSessionsResponse> {
    const params: Record<string, string> = {};
    if (this.options.pageSize)
      params.pageSize = this.options.pageSize.toString();
    if (pageToken) params.pageToken = pageToken;

    // Use the existing ApiClient from your SDK
    const response = await this.apiClient.request<{
      sessions?: SessionResource[];
      nextPageToken?: string;
    }>('sessions', { query: params });

    const sessions = response.sessions || [];

    // Write-Through Cache: Persist fetched sessions immediately
    // Default to true if undefined
    if (sessions.length > 0 && this.options.persist !== false) {
      // We await to ensure data integrity
      await this.storage.upsertMany(sessions);
    }

    return {
      sessions,
      nextPageToken: response.nextPageToken,
    };
  }
}
