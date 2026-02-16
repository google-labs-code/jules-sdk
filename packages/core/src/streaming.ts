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

// src/streaming.ts
import { ApiClient } from './api.js';
import { JulesApiError } from './errors.js';
import { mapRestActivityToSdkActivity } from './mappers.js';
import { Activity, Origin, SessionResource } from './types.js';

// A helper function for delaying execution.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Define the raw REST API response type for listing activities.
type ListActivitiesResponse = {
  activities: any[]; // Using any for now, will be mapped.
  nextPageToken?: string;
};

/**
 * Default number of retries for initial 404 errors when session is not yet ready.
 */
const DEFAULT_INITIAL_RETRIES = 10;

/**
 * Maximum delay between retries in milliseconds (caps exponential backoff).
 */
const MAX_RETRY_DELAY_MS = 30000;

/**
 * Options for controlling the activity stream.
 * @internal
 */
export type StreamActivitiesOptions = {
  /**
   * Filters to exclude certain activities.
   */
  exclude?: {
    originator: Origin;
  };
  /**
   * Number of retries for initial 404 errors when session is not yet ready.
   * @default 10
   */
  initialRetries?: number;
};

/**
 * An async generator that implements a hybrid pagination/polling strategy
 * to stream activities for a given session.
 *
 * @param sessionId The ID of the session to stream activities for.
 * @param apiClient The API client to use for requests.
 * @param pollingInterval The time in milliseconds to wait before polling for new activities.
 * @param platform The platform adapter.
 * @param options Streaming options, including filters.
 * @internal
 */
import { Platform } from './platform/types.js';

export async function* streamActivities(
  sessionId: string,
  apiClient: ApiClient,
  pollingInterval: number,
  platform: Platform,
  options: StreamActivitiesOptions = {},
): AsyncGenerator<Activity> {
  let pageToken: string | undefined = undefined;
  let isFirstCall = true;

  // State to track yielded activities and prevent duplication while managing memory usage.
  // This logic assumes that activities are returned in chronological order (Oldest -> Newest).
  // If the API returns activities in reverse order, this will fail to yield correctly.
  let lastSeenTime = '';
  const seenIdsAtLastTime = new Set<string>();

  while (true) {
    let response: ListActivitiesResponse;
    try {
      response = await apiClient.request<ListActivitiesResponse>(
        `sessions/${sessionId}/activities`,
        {
          query: {
            pageSize: '50', // A reasonable page size
            ...(pageToken ? { pageToken } : {}),
          },
        },
      );
    } catch (error) {
      if (
        isFirstCall &&
        error instanceof JulesApiError &&
        error.status === 404
      ) {
        let lastError: JulesApiError = error;
        let successfulResponse: ListActivitiesResponse | undefined;
        let delay = 1000; // Start with a 1-second delay
        const maxRetries = options.initialRetries ?? DEFAULT_INITIAL_RETRIES;

        for (let i = 0; i < maxRetries; i++) {
          await sleep(delay);
          delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS); // Exponential backoff with cap
          try {
            successfulResponse =
              await apiClient.request<ListActivitiesResponse>(
                `sessions/${sessionId}/activities`,
                {
                  query: {
                    pageSize: '50',
                    ...(pageToken ? { pageToken } : {}),
                  },
                },
              );
            break; // On success, exit the retry loop.
          } catch (retryError) {
            if (
              retryError instanceof JulesApiError &&
              retryError.status === 404
            ) {
              lastError = retryError;
            } else {
              throw retryError; // Re-throw non-404 errors immediately.
            }
          }
        }

        if (successfulResponse) {
          response = successfulResponse;
        } else {
          throw lastError; // If all retries fail, throw the last 404 error.
        }
      } else {
        throw error; // Re-throw non-retryable errors.
      }
    }

    isFirstCall = false; // Mark the first call as done.

    const activities = response.activities || [];

    for (const rawActivity of activities) {
      const activity = mapRestActivityToSdkActivity(rawActivity, platform);

      // Duplication check using timestamp and ID.
      // We rely on the implicit behavior that activities are strictly ordered by creation time.
      if (activity.createTime < lastSeenTime) {
        // Skip activities older than what we've already yielded
        continue;
      }

      if (activity.createTime === lastSeenTime) {
        if (seenIdsAtLastTime.has(activity.id)) {
          // Skip if we've already seen this activity at this timestamp
          continue;
        }
        // New activity at the same timestamp
        seenIdsAtLastTime.add(activity.id);
      } else {
        // activity.createTime > lastSeenTime
        lastSeenTime = activity.createTime;
        seenIdsAtLastTime.clear();
        seenIdsAtLastTime.add(activity.id);
      }

      if (
        options.exclude?.originator &&
        activity.originator === options.exclude.originator
      ) {
        continue;
      }

      yield activity;
    }

    if (response.nextPageToken) {
      pageToken = response.nextPageToken;
      // Immediately fetch the next page without waiting.
      continue;
    } else {
      // We've reached the end of the current stream, so wait before polling again.
      pageToken = undefined; // Reset for the next poll
      await sleep(pollingInterval);
    }
  }
}
