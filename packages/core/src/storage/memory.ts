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

import { Activity, SessionResource } from '../types.js';
import {
  ActivityStorage,
  SessionStorage,
  CachedSession,
  SessionIndexEntry,
} from './types.js';

/**
 * In-memory implementation of ActivityStorage.
 * Useful for testing or environments where persistence is not required.
 */
export class MemoryStorage implements ActivityStorage {
  private activities: Activity[] = [];
  private indices: Map<string, number> = new Map();

  /**
   * Initializes the storage. No-op for memory storage.
   */
  async init(): Promise<void> {
    // No-op for memory
  }

  /**
   * Closes the storage and clears memory.
   */
  async close(): Promise<void> {
    this.activities = []; // Clear memory on close
    this.indices.clear();
  }

  /**
   * Appends an activity to the in-memory list.
   *
   * **Guarantee:**
   * - Idempotent: If an activity with the same ID exists, it updates it in place.
   * - Append-only: New activities are always added to the end.
   *
   * **Side Effects:**
   * - Modifies the internal `activities` array.
   */
  async append(activity: Activity): Promise<void> {
    // Upsert logic to maintain idempotency contract
    if (this.indices.has(activity.id)) {
      const index = this.indices.get(activity.id)!;
      // Maintain original position
      this.activities[index] = activity;
    } else {
      const index = this.activities.push(activity) - 1;
      this.indices.set(activity.id, index);
    }
  }

  /**
   * Retrieves an activity by ID.
   */
  async get(activityId: string): Promise<Activity | undefined> {
    const index = this.indices.get(activityId);
    if (index !== undefined) {
      return this.activities[index];
    }
    return undefined;
  }

  /**
   * Retrieves the latest activity.
   */
  async latest(): Promise<Activity | undefined> {
    if (this.activities.length === 0) return undefined;
    return this.activities[this.activities.length - 1];
  }

  /**
   * Yields all activities in chronological order.
   */
  async *scan(): AsyncIterable<Activity> {
    for (const activity of this.activities) {
      yield activity;
    }
  }
}

/**
 * In-memory implementation of SessionStorage.
 */
export class MemorySessionStorage implements SessionStorage {
  private sessions: Map<string, CachedSession> = new Map();
  private index: SessionIndexEntry[] = [];

  async init(): Promise<void> {
    // No-op
  }

  async upsert(session: SessionResource): Promise<void> {
    this.sessions.set(session.id, {
      resource: session,
      _lastSyncedAt: Date.now(),
    });

    // Append to index (mimicking file behavior)
    this.index.push({
      id: session.id,
      title: session.title,
      state: session.state,
      createTime: session.createTime,
      source: session.sourceContext?.source || 'unknown',
      _updatedAt: Date.now(),
    });
  }

  async upsertMany(sessions: SessionResource[]): Promise<void> {
    for (const s of sessions) {
      await this.upsert(s);
    }
  }

  async get(sessionId: string): Promise<CachedSession | undefined> {
    return this.sessions.get(sessionId);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    // Index entries remain (append-only simulation), or we could filter them out.
    // Spec says "We do NOT rewrite the index here for performance", so we leave them.
  }

  async *scanIndex(): AsyncIterable<SessionIndexEntry> {
    for (const entry of this.index) {
      yield entry;
    }
  }
}
