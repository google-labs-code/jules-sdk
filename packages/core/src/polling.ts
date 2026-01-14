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

// src/polling.ts
import { ApiClient } from './api.js';
import { SessionResource } from './types.js';

// A helper function for delaying execution.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A generalized utility for polling the session resource until a specific
 * condition is met.
 *
 * @param sessionId The ID of the session to poll.
 * @param apiClient The API client for making requests.
 * @param predicateFn A function that returns `true` if polling should stop.
 * @param pollingInterval The interval in milliseconds between poll attempts.
 * @returns The session resource that satisfied the predicate.
 * @internal
 */
export async function pollSession(
  sessionId: string,
  apiClient: ApiClient,
  predicateFn: (session: SessionResource) => boolean,
  pollingInterval: number,
): Promise<SessionResource> {
  while (true) {
    const session = await apiClient.request<SessionResource>(
      `sessions/${sessionId}`,
    );

    if (predicateFn(session)) {
      return session;
    }

    await sleep(pollingInterval);
  }
}

/**
 * Polls the `GET /sessions/{id}` endpoint until the session reaches a terminal state.
 *
 * @param sessionId The ID of the session to poll.
 * @param apiClient The API client for making requests.
 * @param pollingInterval The interval in milliseconds between poll attempts.
 * @returns The final SessionResource.
 * @internal
 */
export async function pollUntilCompletion(
  sessionId: string,
  apiClient: ApiClient,
  pollingInterval: number,
): Promise<SessionResource> {
  return pollSession(
    sessionId,
    apiClient,
    (session) => session.state === 'completed' || session.state === 'failed',
    pollingInterval,
  );
}
