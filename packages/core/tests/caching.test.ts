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

import { describe, it, expect } from 'vitest';
import { determineCacheTier, isCacheValid } from '../src/caching.js';
import { CachedSession } from '../src/storage/types.js';
import { SessionResource, SessionOutcome } from '../src/types.js';

const mockOutcome: SessionOutcome = {
  sessionId: 'test',
  title: '',
  state: 'completed',
  outputs: [],
  generatedFiles: () => ({
    all: () => [],
    get: () => undefined,
    filter: () => [],
  }),
  changeSet: () => undefined,
};

describe('Iceberg Caching Logic', () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

  const mockSession = (state: string, createTime: string): SessionResource => ({
    id: 'test',
    name: 'sessions/test',
    state: state as any,
    createTime,
    updateTime: createTime,
    prompt: '',
    sourceContext: { source: '' },
    source: {
      name: 'sources/github/test/repo',
      id: 'github/test/repo',
      type: 'githubRepo',
      githubRepo: { owner: 'test', repo: 'repo', isPrivate: false },
    },
    title: '',
    url: '',
    outputs: [],
    outcome: mockOutcome,
  });

  const createCachedSession = (
    state: string,
    ageMs: number,
    lastSyncedAgoMs: number,
  ): CachedSession => {
    const now = Date.now();
    return {
      resource: mockSession(state, new Date(now - ageMs).toISOString()),
      _lastSyncedAt: now - lastSyncedAgoMs,
    };
  };

  it('should identify FROZEN tier (> 30 days old)', () => {
    const cached = createCachedSession('inProgress', ONE_MONTH_MS + 1000, 0);
    expect(determineCacheTier(cached)).toBe('frozen');
    expect(isCacheValid(cached)).toBe(true);
  });

  it('should identify WARM tier (Terminal state + Synced < 24h)', () => {
    // Completed, created recently, synced 1 hour ago
    const cachedCompleted = createCachedSession(
      'completed',
      1000,
      ONE_DAY_MS - 1000,
    );
    expect(determineCacheTier(cachedCompleted)).toBe('warm');
    expect(isCacheValid(cachedCompleted)).toBe(true);

    // Failed, created recently, synced 1 hour ago
    const cachedFailed = createCachedSession('failed', 1000, ONE_DAY_MS - 1000);
    expect(determineCacheTier(cachedFailed)).toBe('warm');
    expect(isCacheValid(cachedFailed)).toBe(true);
  });

  it('should identify HOT tier (Non-terminal state)', () => {
    const cached = createCachedSession('inProgress', 1000, 0);
    expect(determineCacheTier(cached)).toBe('hot');
    expect(isCacheValid(cached)).toBe(false);
  });

  it('should identify HOT tier (Terminal state but stale sync > 24h)', () => {
    const cached = createCachedSession('completed', 1000, ONE_DAY_MS + 1000);
    expect(determineCacheTier(cached)).toBe('hot');
    expect(isCacheValid(cached)).toBe(false);
  });

  it('should prioritize FROZEN over WARM/HOT based on age', () => {
    // Old (> 30 days) but active state -> Should be Frozen because it's old
    // Wait, the logic is: if age > 30 days -> frozen.
    const cached = createCachedSession('inProgress', ONE_MONTH_MS + 1000, 0);
    expect(determineCacheTier(cached)).toBe('frozen');
  });

  it('should handle undefined cache gracefully', () => {
    expect(isCacheValid(undefined)).toBe(false);
  });
});
