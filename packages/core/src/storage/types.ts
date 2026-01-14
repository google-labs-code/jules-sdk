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

/**
 * Represents the wrapper around the raw resource, adding local metadata.
 */
export type CachedSession = {
  resource: SessionResource;
  _lastSyncedAt: number; // Epoch timestamp of last successful network sync
};

/**
 * Subset of session fields required for the high-speed index.
 * These are the fields we can filter on without opening the heavy session file.
 */
export type SessionIndexEntry = {
  id: string;
  title: string;
  state: string;
  createTime: string;
  source: string; // "sources/github/..."
  _updatedAt: number; // Local write time
};

/**
 * Ephemeral (but persisted) metadata about a session's cache state.
 * Stored separately from the main session.json to allow for frequent updates
 * without rewriting the larger session object.
 */
export type SessionMetadata = {
  activityCount: number;
};

export interface SessionStorage {
  /**
   * Initializes the storage (ensure directories exist).
   */
  init(): Promise<void>;

  /**
   * Persists a session state.
   * 1. Writes the full resource to atomic storage (.jules/cache/<id>/session.json).
   * 2. Appends metadata to the high-speed index (.jules/cache/sessions.jsonl).
   */
  upsert(session: SessionResource): Promise<void>;

  /**
   * Bulk optimization for upserting pages from the API.
   */
  upsertMany(sessions: SessionResource[]): Promise<void>;

  /**
   * Retrieves a specific session by ID.
   * Returns undefined if not found or if the file is corrupt.
   */
  get(sessionId: string): Promise<CachedSession | undefined>;

  /**
   * Deletes a session and its associated artifacts from local cache.
   */
  delete(sessionId: string): Promise<void>;

  /**
   * Scans the high-speed index.
   * Implementation MUST handle deduplication (Last-Write-Wins) because the
   * index is an append-only log.
   */
  scanIndex(): AsyncIterable<SessionIndexEntry>;
}

/**
 * Abstract interface for the isomorphic storage layer.
 * Implementations handle the specifics of persisting immutable activities
 * to the available medium (Filesystem, IndexedDB, Memory, etc.).
 */
export interface ActivityStorage {
  /**
   * Lifecycle method to initialize the storage (e.g., open DB connection, ensure storage directory exists).
   * Must be called before any other method.
   */
  init(): Promise<void>;

  /**
   * Lifecycle method to close connections or flush buffers.
   */
  close(): Promise<void>;

  /**
   * Persists a single activity.
   * Implementations MUST guarantee this is an append-only operation (or upsert if ID matches).
   * It should NEVER delete or modify a different activity.
   */
  append(activity: Activity): Promise<void>;

  /**
   * Retrieves a specific activity by its ID.
   * @returns The activity if found, or undefined.
   */
  get(activityId: string): Promise<Activity | undefined>;

  /**
   * Retrieves the most recently appended activity.
   * Crucial for determining the high-water mark for network synchronization.
   */
  latest(): Promise<Activity | undefined>;

  /**
   * Yields all stored activities in chronological order (insertion order).
   * Must support standard 'for await...of' loops.
   */
  scan(): AsyncIterable<Activity>;
}

export interface GlobalCacheMetadata {
  lastSyncedAt: number;
  sessionCount: number;
}
