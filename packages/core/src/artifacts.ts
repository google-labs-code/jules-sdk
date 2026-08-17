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

import type {
  RestMediaArtifact,
  GitPatch,
  ParsedChangeSet,
  ParsedFile,
  GeneratedFile,
  GeneratedFiles,
} from './types.js';
import { Platform } from './platform/types.js';

/**
 * Parses a unified diff string and extracts file information.
 * @internal
 */
export function parseUnidiff(patch?: string | null): ParsedFile[] {
  if (!patch) return [];
  const files: ParsedFile[] = [];
  // Single-pass optimization: avoid splitting by regex and heavy nested array allocations.
  // Instead, split by line once, and track file block state sequentially.
  const lines = patch.split('\n');
  const totalLines = lines.length;

  let currentPath = '';
  let fromPath = '';
  let toPath = '';
  let hasFromNull = false;
  let hasToNull = false;
  let additions = 0;
  let deletions = 0;
  let inHunk = false;
  let hasFile = false;

  const commitFile = () => {
    if (!hasFile) return;

    let changeType: 'created' | 'modified' | 'deleted';
    if (fromPath === '' || hasFromNull) {
      changeType = 'created';
      currentPath = toPath;
    } else if (toPath === '' || hasToNull) {
      changeType = 'deleted';
      currentPath = fromPath;
    } else {
      changeType = 'modified';
      currentPath = toPath;
    }

    if (currentPath) {
      files.push({
        path: currentPath,
        changeType,
        additions,
        deletions,
      });
    }
  };

  for (let i = 0; i < totalLines; i++) {
    const line = lines[i];

    if (line.startsWith('diff --git ')) {
      commitFile();
      // Reset state for new file block
      currentPath = '';
      fromPath = '';
      toPath = '';
      hasFromNull = false;
      hasToNull = false;
      additions = 0;
      deletions = 0;
      inHunk = false;
      hasFile = true;
      continue;
    }

    if (!hasFile) continue;

    if (line.startsWith('--- ')) {
      const slice = line.slice(4).replace(/\r$/, '');
      if (slice === '/dev/null') {
        hasFromNull = true;
        fromPath = '';
      } else {
        fromPath = slice.startsWith('a/') ? slice.slice(2) : slice;
      }
      continue;
    }

    if (line.startsWith('+++ ')) {
      const slice = line.slice(4).replace(/\r$/, '');
      if (slice === '/dev/null') {
        hasToNull = true;
        toPath = '';
      } else {
        toPath = slice.startsWith('b/') ? slice.slice(2) : slice;
      }
      continue;
    }

    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }

    if (inHunk) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }
  }

  commitFile();
  return files;
}

/**
 * Parses a unified diff and extracts file information including content.
 * @internal
 */
export function parseUnidiffWithContent(
  patch?: string | null,
): GeneratedFile[] {
  if (!patch) return [];
  const files: GeneratedFile[] = [];
  // Single-pass optimization: avoid splitting by regex and heavy nested array allocations.
  // Instead, split by line once, and track file block state sequentially.
  const lines = patch.split('\n');
  const totalLines = lines.length;

  let currentPath = '';
  let fromPath = '';
  let toPath = '';
  let hasFromNull = false;
  let hasToNull = false;
  let additions = 0;
  let deletions = 0;
  let inHunk = false;
  let hasFile = false;
  let contentLines: string[] = [];

  const commitFile = () => {
    if (!hasFile) return;

    let changeType: 'created' | 'modified' | 'deleted';
    if (fromPath === '' || hasFromNull) {
      changeType = 'created';
      currentPath = toPath;
    } else if (toPath === '' || hasToNull) {
      changeType = 'deleted';
      currentPath = fromPath;
    } else {
      changeType = 'modified';
      currentPath = toPath;
    }

    if (currentPath) {
      const content = changeType === 'deleted' ? '' : contentLines.join('\n');
      files.push({
        path: currentPath,
        changeType,
        content,
        additions,
        deletions,
      });
    }
  };

  for (let i = 0; i < totalLines; i++) {
    const line = lines[i];

    if (line.startsWith('diff --git ')) {
      commitFile();
      // Reset state for new file block
      currentPath = '';
      fromPath = '';
      toPath = '';
      hasFromNull = false;
      hasToNull = false;
      additions = 0;
      deletions = 0;
      inHunk = false;
      hasFile = true;
      contentLines = [];
      continue;
    }

    if (!hasFile) continue;

    if (line.startsWith('--- ')) {
      const slice = line.slice(4).replace(/\r$/, '');
      if (slice === '/dev/null') {
        hasFromNull = true;
        fromPath = '';
      } else {
        fromPath = slice.startsWith('a/') ? slice.slice(2) : slice;
      }
      continue;
    }

    if (line.startsWith('+++ ')) {
      const slice = line.slice(4).replace(/\r$/, '');
      if (slice === '/dev/null') {
        hasToNull = true;
        toPath = '';
      } else {
        toPath = slice.startsWith('b/') ? slice.slice(2) : slice;
      }
      continue;
    }

    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }

    if (inHunk) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
        contentLines.push(line.slice(1));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }
  }

  commitFile();
  return files;
}

/**
 * Creates a GeneratedFiles helper object from an array of GeneratedFile.
 * @internal
 */
export function createGeneratedFiles(files: GeneratedFile[]): GeneratedFiles {
  return {
    all: () => files,
    get: (path: string) => files.find((f) => f.path === path),
    filter: (changeType: 'created' | 'modified' | 'deleted') =>
      files.filter((f) => f.changeType === changeType),
  };
}

/**
 * Represents a media artifact (e.g. image) produced by an activity.
 * Provides helper methods for saving and viewing the media.
 */
export class MediaArtifact {
  public readonly type = 'media';
  public readonly data: string;
  public readonly format: string;
  private platform: Platform;
  private activityId?: string;

  constructor(
    artifact: RestMediaArtifact['media'],
    platform: Platform,
    activityId?: string,
  ) {
    this.data = artifact.data;
    this.format = artifact.mimeType;
    this.platform = platform;
    this.activityId = activityId;
  }

  /**
   * Saves the media artifact to a file.
   *
   * **Side Effects:**
   * - Node.js: Writes the file to disk (overwrites if exists).
   * - Browser: Saves the file to the 'artifacts' object store in IndexedDB.
   *
   * @param filepath The path where the file should be saved.
   */
  async save(filepath: string): Promise<void> {
    await this.platform.saveFile(
      filepath,
      this.data,
      'base64',
      this.activityId,
    );
  }

  /**
   * Converts the media artifact to a data URL.
   * Useful for displaying images in a browser.
   *
   * **Data Transformation:**
   * - Prefixes the base64 data with `data:<mimeType>;base64,`.
   *
   * @returns A valid Data URI string.
   */
  toUrl(): string {
    return this.platform.createDataUrl(this.data, this.format);
  }
}

/**
 * Represents a set of code changes (unified diff) produced by an activity.
 * Provides a helper method to parse the diff into structured data.
 */
export class ChangeSetArtifact {
  public readonly type = 'changeSet' as const;
  public readonly source: string;
  public readonly gitPatch: GitPatch;
  private _cachedParsed: ParsedChangeSet | null = null;

  constructor(source: string, gitPatch: GitPatch) {
    this.source = source;
    this.gitPatch = gitPatch;
  }

  /**
   * Parses the unified diff and returns structured file change information.
   *
   * **Data Transformation:**
   * - Extracts file paths from diff headers.
   * - Determines change type (created/modified/deleted) from /dev/null markers.
   * - Counts additions (+) and deletions (-) in hunks.
   *
   * **Performance Optimization:**
   * - Lazy memoization caches parsed result on `_cachedParsed` to convert repeated
   *   `parsed()` calls from O(N) diff parsing to O(1) instant returns.
   * - Summary categorization uses a single native indexed loop instead of 3 sequential `.filter()`
   *   scans, avoiding array allocations and reducing loop passes from 3 to 1.
   *
   * @returns Parsed diff with file paths, change types, and line counts.
   */
  parsed(): ParsedChangeSet {
    if (this._cachedParsed) {
      return this._cachedParsed;
    }

    if (!this.gitPatch?.unidiffPatch) {
      this._cachedParsed = {
        files: [],
        summary: { totalFiles: 0, created: 0, modified: 0, deleted: 0 },
      };
      return this._cachedParsed;
    }

    const files = parseUnidiff(this.gitPatch.unidiffPatch);
    const totalFiles = files.length;

    let created = 0;
    let modified = 0;
    let deleted = 0;

    for (let i = 0; i < totalFiles; i++) {
      const type = files[i].changeType;
      if (type === 'created') {
        created++;
      } else if (type === 'modified') {
        modified++;
      } else if (type === 'deleted') {
        deleted++;
      }
    }

    this._cachedParsed = {
      files,
      summary: {
        totalFiles,
        created,
        modified,
        deleted,
      },
    };

    return this._cachedParsed;
  }
}
