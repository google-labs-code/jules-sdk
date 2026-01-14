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

/**
 * Utilities for constructing and parsing Jules API pageTokens.
 *
 * The Jules API uses nanosecond timestamps as pageTokens for activity pagination.
 * This allows us to construct tokens from cached activity createTimes,
 * enabling efficient incremental syncing without re-downloading existing activities.
 *
 * @module
 */

/**
 * Converts a Jules API pageToken back to a Date.
 * Useful for debugging and logging.
 *
 * @param token - The pageToken string (nanosecond timestamp)
 * @returns The corresponding Date object
 *
 * @example
 * ```typescript
 * const date = pageTokenToDate("1704448500999999000");
 * // Returns Date for 2024-01-05T10:05:00.999Z
 * ```
 */
export function pageTokenToDate(token: string): Date {
  const tokenNs = BigInt(token);
  const tokenMs = Number(tokenNs / 1000000n);
  return new Date(tokenMs);
}

/**
 * Checks if a session's activities are "frozen" (no new activities possible).
 * A session is considered frozen if its last activity is older than the threshold.
 *
 * @param lastActivityCreateTime - The createTime of the most recent activity
 * @param thresholdDays - Number of days after which a session is frozen (default: 30)
 * @returns true if the session is frozen and no API call is needed
 *
 * @example
 * ```typescript
 * const isFrozen = isSessionFrozen("2024-01-05T10:05:00Z");
 * if (isFrozen) {
 *   // Skip API call - no new activities will ever appear
 * }
 * ```
 */
export function isSessionFrozen(
  lastActivityCreateTime: string,
  thresholdDays = 30,
): boolean {
  const lastActivity = new Date(lastActivityCreateTime);
  const now = new Date();
  const ageMs = now.getTime() - lastActivity.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > thresholdDays;
}
