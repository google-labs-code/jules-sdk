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

import * as fs from 'fs/promises';
import { createReadStream, createWriteStream, WriteStream } from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Activity, SessionResource } from '../types.js';
import {
  ActivityStorage,
  SessionStorage,
  CachedSession,
  SessionIndexEntry,
  SessionMetadata,
} from './types.js';

/**
 * Node.js filesystem implementation of ActivityStorage.
 * Stores activities in a JSONL file located at `.jules/cache/<sessionId>/activities.jsonl`.
 */
export class NodeFileStorage implements ActivityStorage {
  private filePath: string;
  private metadataPath: string;
  private initialized = false;
  private writeStream: WriteStream | null = null;

  // In-memory index: ActivityID -> Byte Offset
  private index: Map<string, number> = new Map();
  private indexBuilt = false;
  private indexBuildPromise: Promise<void> | null = null;

  // Tracks the current file size to calculate offsets for new appends
  private currentFileSize = 0;

  constructor(sessionId: string, rootDir: string) {
    const sessionCacheDir = path.resolve(rootDir, '.jules/cache', sessionId);
    this.filePath = path.join(sessionCacheDir, 'activities.jsonl');
    this.metadataPath = path.join(sessionCacheDir, 'metadata.json');
  }

  /**
   * Initializes the storage by ensuring the cache directory exists.
   *
   * **Side Effects:**
   * - Creates the `.jules/cache/<sessionId>` directory if it does not exist.
   * - Sets the internal `initialized` flag.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    // Ensure the cache directory exists before we ever try to read/write
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    // Initialize currentFileSize for accurate append offsets
    try {
      const stats = await fs.stat(this.filePath);
      this.currentFileSize = stats.size;
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        this.currentFileSize = 0;
      } else {
        throw e;
      }
    }

    // Open a persistent write stream for efficient appending
    this.writeStream = createWriteStream(this.filePath, {
      flags: 'a',
      encoding: 'utf8',
    });

    // Prevent process crash on stream error
    this.writeStream.on('error', (err) => {
      console.error(
        `[NodeFileStorage] WriteStream error for ${this.filePath}:`,
        err,
      );
      // We might want to set initialized = false or nullify stream,
      // but for now, logging prevents the crash.
    });

    this.initialized = true;
  }

  /**
   * Closes the storage.
   */
  async close(): Promise<void> {
    if (this.writeStream) {
      await new Promise<void>((resolve) => this.writeStream!.end(resolve));
      this.writeStream = null;
    }
    this.initialized = false;
    this.indexBuilt = false;
    this.index.clear();
    // We do not await indexBuildPromise as we are closing.
    this.indexBuildPromise = null;
  }

  private async _readMetadata(): Promise<SessionMetadata> {
    try {
      const content = await fs.readFile(this.metadataPath, 'utf8');
      return JSON.parse(content) as SessionMetadata;
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return { activityCount: 0 }; // Default if file doesn't exist
      }
      throw e;
    }
  }

  private async _writeMetadata(metadata: SessionMetadata): Promise<void> {
    await fs.writeFile(
      this.metadataPath,
      JSON.stringify(metadata, null, 2),
      'utf8',
    );
  }

  /**
   * Appends an activity to the file.
   *
   * **Side Effects:**
   * - Appends a new line containing the JSON representation of the activity to `activities.jsonl`.
   * - Implicitly calls `init()` if not already initialized.
   */
  async append(activity: Activity): Promise<void> {
    // Safety check: ensure init() was called if the user forgot
    if (!this.initialized) await this.init();

    // 1. Atomically update metadata
    const metadata = await this._readMetadata();
    metadata.activityCount += 1;
    await this._writeMetadata(metadata);

    // 2. Append the activity
    const line = JSON.stringify(activity) + '\n';
    const startOffset = this.currentFileSize;

    // Write to stream. Handle backpressure if necessary.
    if (this.writeStream) {
      const canContinue = this.writeStream.write(line);
      this.currentFileSize += Buffer.byteLength(line);

      // Concurrency Handling:
      // Update the index if it's already built or if a build is in progress.
      // This optimistic update ensures the new activity is indexed even if the
      // background scan (buildIndex) misses it due to race conditions.
      if (this.indexBuilt || this.indexBuildPromise) {
        if (!this.index.has(activity.id)) {
          this.index.set(activity.id, startOffset);
        }
      }

      if (!canContinue) {
        await new Promise<void>((resolve) =>
          this.writeStream!.once('drain', resolve),
        );
      }
    } else {
      throw new Error('NodeFileStorage: WriteStream is not initialized');
    }
  }

  /**
   * Builds the in-memory index by scanning the file once.
   * Handles concurrency by coalescing multiple calls into a single promise.
   */
  private async buildIndex(): Promise<void> {
    if (this.indexBuilt) return;
    if (this.indexBuildPromise) return this.indexBuildPromise;

    this.indexBuildPromise = (async () => {
      try {
        this.index.clear();

        try {
          await fs.access(this.filePath);
        } catch (e) {
          // File doesn't exist, index is empty but built
          this.indexBuilt = true;
          return;
        }

        const fileStream = createReadStream(this.filePath, {
          encoding: 'utf8',
        });
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity,
        });

        let currentOffset = 0;
        for await (const line of rl) {
          const byteLen = Buffer.byteLength(line);
          // readline strips \n or \r\n. We assume \n (1 byte) as we write it.
          const lineTotalBytes = byteLen + 1;

          if (line.trim().length > 0) {
            try {
              const activity = JSON.parse(line) as Activity;
              if (!this.index.has(activity.id)) {
                this.index.set(activity.id, currentOffset);
              }
            } catch (e) {
              // Ignore corrupt lines
            }
          }
          currentOffset += lineTotalBytes;
        }

        this.indexBuilt = true;
      } finally {
        this.indexBuildPromise = null;
      }
    })();

    return this.indexBuildPromise;
  }

  /**
   * Retrieves an activity by ID.
   * Uses an in-memory index (ID -> Offset) to seek directly to the line.
   */
  async get(activityId: string): Promise<Activity | undefined> {
    if (!this.initialized) await this.init();
    if (!this.indexBuilt) await this.buildIndex();

    const offset = this.index.get(activityId);
    if (offset === undefined) return undefined;

    return new Promise((resolve, reject) => {
      // Create a stream starting at the exact offset
      const stream = createReadStream(this.filePath, {
        start: offset,
        encoding: 'utf8',
      });
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      let found = false;
      rl.on('line', (line) => {
        if (found) return; // Prevent double firing
        found = true;

        // We only needed the first line
        rl.close();
        stream.destroy();

        try {
          const activity = JSON.parse(line) as Activity;
          resolve(activity);
        } catch (e) {
          // If the indexed line is corrupt (shouldn't happen if buildIndex verified it)
          resolve(undefined);
        }
      });

      rl.on('error', (err) => {
        reject(err);
      });

      stream.on('error', (err) => {
        reject(err);
      });

      // Handle case where stream ends without yielding a line (e.g., EOF right at offset)
      rl.on('close', () => {
        if (!found) resolve(undefined);
      });
    });
  }

  /**
   * Retrieves the latest activity.
   * Efficiently reads the file backwards to find the last valid entry.
   */
  async latest(): Promise<Activity | undefined> {
    if (!this.initialized) await this.init();

    try {
      await fs.access(this.filePath);
    } catch (e) {
      if ((e as any).code === 'ENOENT') {
        return undefined; // File doesn't exist
      }
      throw e;
    }

    // Optimization: Read backward from the end of the file.
    // This is significantly faster than scanning the entire file for large logs.
    const stat = await fs.stat(this.filePath);
    const fileSize = stat.size;

    if (fileSize === 0) return undefined;

    // We'll read in chunks from the end.
    // 4KB is typically enough for several activity lines.
    const bufferSize = 4096;
    const buffer = Buffer.alloc(bufferSize);
    let fd: fs.FileHandle | undefined;

    try {
      fd = await fs.open(this.filePath, 'r');
      let currentPos = fileSize;
      let trailing = ''; // To hold parts of lines from previous chunks

      while (currentPos > 0) {
        const readSize = Math.min(bufferSize, currentPos);
        const position = currentPos - readSize;

        const result = await fd.read(buffer, 0, readSize, position);
        const chunk = result.buffer.toString('utf8', 0, readSize);

        // Prepend previous trailing content
        const content = chunk + trailing;

        // Split by newline
        const lines = content.split('\n');

        // The last part might be an incomplete line (start of a line),
        // so it becomes the 'trailing' part for the next iteration (reading earlier).
        // Exception: if currentPos was 0, we read the start of the file, so the first part is a valid start.
        if (position > 0) {
          trailing = lines.shift() || ''; // The first element is the partial line at the end of the *previous* chunk (start of this chunk's content)
        } else {
          // We are at the start of the file, so the first element is a complete line
          trailing = '';
        }

        // Iterate lines from end to start
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.length === 0) continue;

          try {
            return JSON.parse(line) as Activity;
          } catch (e) {
            console.warn(
              `[NodeFileStorage] Corrupt JSON line ignored during latest() check in ${this.filePath}`,
            );
            // Continue searching backwards
          }
        }

        currentPos -= readSize;
      }
    } finally {
      if (fd) await fd.close();
    }

    return undefined;
  }

  /**
   * Yields all activities in the file.
   *
   * **Behavior:**
   * - Opens a read stream to `activities.jsonl`.
   * - Reads line-by-line using `readline`.
   * - Parses each line as JSON.
   *
   * **Edge Cases:**
   * - Logs a warning and skips lines if JSON parsing fails (corrupt data).
   * - Returns immediately (yields nothing) if the file does not exist.
   */
  async *scan(): AsyncIterable<Activity> {
    if (!this.initialized) await this.init();

    try {
      await fs.access(this.filePath);
    } catch (e) {
      if ((e as any).code === 'ENOENT') {
        return; // File doesn't exist, yield nothing.
      }
      throw e;
    }

    const fileStream = createReadStream(this.filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim().length === 0) continue;
      try {
        yield JSON.parse(line) as Activity;
      } catch (e) {
        console.warn(
          `[NodeFileStorage] Corrupt JSON line ignored in ${this.filePath}`,
        );
      }
    }
  }
}

export class NodeSessionStorage implements SessionStorage {
  private cacheDir: string;
  private indexFilePath: string;
  private initialized = false;

  constructor(rootDir: string) {
    this.cacheDir = path.resolve(rootDir, '.jules/cache');
    this.indexFilePath = path.join(this.cacheDir, 'sessions.jsonl');
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.cacheDir, { recursive: true });
    this.initialized = true;
  }

  private getSessionPath(sessionId: string): string {
    return path.join(this.cacheDir, sessionId, 'session.json');
  }

  async upsert(session: SessionResource): Promise<void> {
    await this.init();

    // 1. Write the Atomic "Source of Truth"
    const sessionDir = path.join(this.cacheDir, session.id);
    await fs.mkdir(sessionDir, { recursive: true });

    const cached: CachedSession = {
      resource: session,
      _lastSyncedAt: Date.now(),
    };

    // Write atomically (JSON.stringify is fast for single sessions)
    await fs.writeFile(
      path.join(sessionDir, 'session.json'),
      JSON.stringify(cached, null, 2),
      'utf8',
    );

    // 2. Update the High-Speed Index (Append-Only)
    // We strictly append. The reader is responsible for deduplication.
    const indexEntry: SessionIndexEntry = {
      id: session.id,
      title: session.title,
      state: session.state,
      createTime: session.createTime,
      source: session.sourceContext?.source || 'unknown',
      _updatedAt: Date.now(),
    };

    await fs.appendFile(
      this.indexFilePath,
      JSON.stringify(indexEntry) + '\n',
      'utf8',
    );
  }

  async upsertMany(sessions: SessionResource[]): Promise<void> {
    // Parallelize file writes, sequentialize index write
    await Promise.all(sessions.map((s) => this.upsert(s)));
  }

  async get(sessionId: string): Promise<CachedSession | undefined> {
    await this.init();
    try {
      const data = await fs.readFile(this.getSessionPath(sessionId), 'utf8');
      return JSON.parse(data) as CachedSession;
    } catch (e: any) {
      if (e.code === 'ENOENT') return undefined;
      throw e;
    }
  }

  async delete(sessionId: string): Promise<void> {
    await this.init();
    // 1. Remove the directory (Metadata + Activities + Artifacts)
    const sessionDir = path.join(this.cacheDir, sessionId);
    await fs.rm(sessionDir, { recursive: true, force: true });

    // 2. We do NOT rewrite the index here for performance.
    // The "Get" method will return 404 (undefined) which is the ultimate check.
    // Periodic compaction can clean the index later.
  }

  async *scanIndex(): AsyncIterable<SessionIndexEntry> {
    await this.init();

    // Read the raw stream
    // Note: In Phase 3 (Query Planner), we will optimize this to read backward
    // or keep an in-memory map to dedupe instantly.
    try {
      const fileStream = createReadStream(this.indexFilePath, {
        encoding: 'utf8',
      });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      // Deduplication Map: ID -> Entry
      const entries = new Map<string, SessionIndexEntry>();

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as SessionIndexEntry;
          entries.set(entry.id, entry);
        } catch (e) {
          /* ignore corrupt lines */
        }
      }

      for (const entry of entries.values()) {
        yield entry;
      }
    } catch (e: any) {
      if (e.code === 'ENOENT') return; // No index yet
      throw e;
    }
  }
}
