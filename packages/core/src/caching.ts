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

import { SessionResource } from './types.js';
import { CachedSession } from './storage/types.js';

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type CacheTier = 'hot' | 'warm' | 'frozen';

/**
 * Determines the cache tier for a session based on its state and age.
 *
 * Strategy:
 * - **Frozen (Tier 3):** > 30 days old. Immutable.
 * - **Warm (Tier 2):** Terminal state + Verified < 24h ago. High read performance.
 * - **Hot (Tier 1):** Active or Stale. Requires network sync.
 */
export function determineCacheTier(
  cached: CachedSession,
  now: number = Date.now(),
): CacheTier {
  const createdAt = new Date(cached.resource.createTime).getTime();
  const age = now - createdAt;
  const isTerminal = ['failed', 'completed'].includes(cached.resource.state);

  // TIER 3: FROZEN (Older than 1 month)
  if (age > ONE_MONTH_MS) {
    return 'frozen';
  }

  // TIER 2: WARM (Terminal state + synced recently)
  const timeSinceSync = now - cached._lastSyncedAt;
  if (isTerminal && timeSinceSync < ONE_DAY_MS) {
    return 'warm';
  }

  // TIER 1: HOT
  return 'hot';
}

/**
 * Helper to check if a cached session is valid to return immediately.
 * Returns true if the session is Frozen or Warm.
 */
export function isCacheValid(
  cached: CachedSession | undefined,
  now: number = Date.now(),
): cached is CachedSession {
  if (!cached) return false;
  const tier = determineCacheTier(cached, now);
  return tier === 'frozen' || tier === 'warm';
}
