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
  RestBashOutputArtifact,
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
  // Split by diff headers (diff --git a/... b/...)
  const diffSections = patch.split(/^diff --git /m).filter(Boolean);

  for (const section of diffSections) {
    const lines = section.split('\n');

    // Extract file path from the +++ line (destination file)
    // Format: +++ b/path/to/file or +++ /dev/null
    let path = '';
    let fromPath = '';
    let toPath = '';

    for (const line of lines) {
      if (line.startsWith('--- ')) {
        // --- a/path or --- /dev/null
        fromPath = line
          .slice(4)
          .replace(/^a\//, '')
          .replace(/^\/dev\/null$/, '');
      } else if (line.startsWith('+++ ')) {
        // +++ b/path or +++ /dev/null
        toPath = line
          .slice(4)
          .replace(/^b\//, '')
          .replace(/^\/dev\/null$/, '');
      }
    }

    // Determine change type and path
    let changeType: 'created' | 'modified' | 'deleted';
    if (fromPath === '' || lines.some((l) => l.startsWith('--- /dev/null'))) {
      changeType = 'created';
      path = toPath;
    } else if (
      toPath === '' ||
      lines.some((l) => l.startsWith('+++ /dev/null'))
    ) {
      changeType = 'deleted';
      path = fromPath;
    } else {
      changeType = 'modified';
      path = toPath;
    }

    // Skip if we couldn't determine a path
    if (!path) continue;

    // Count additions and deletions (lines starting with + or - in hunks)
    let additions = 0;
    let deletions = 0;
    let inHunk = false;

    for (const line of lines) {
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

    files.push({ path, changeType, additions, deletions });
  }

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
  // Split by diff headers (diff --git a/... b/...)
  const diffSections = patch.split(/^diff --git /m).filter(Boolean);

  for (const section of diffSections) {
    const lines = section.split('\n');

    // Extract file path from the +++ line (destination file)
    let path = '';
    let fromPath = '';
    let toPath = '';

    for (const line of lines) {
      if (line.startsWith('--- ')) {
        fromPath = line
          .slice(4)
          .replace(/^a\//, '')
          .replace(/^\/dev\/null$/, '');
      } else if (line.startsWith('+++ ')) {
        toPath = line
          .slice(4)
          .replace(/^b\//, '')
          .replace(/^\/dev\/null$/, '');
      }
    }

    // Determine change type and path
    let changeType: 'created' | 'modified' | 'deleted';
    if (fromPath === '' || lines.some((l) => l.startsWith('--- /dev/null'))) {
      changeType = 'created';
      path = toPath;
    } else if (
      toPath === '' ||
      lines.some((l) => l.startsWith('+++ /dev/null'))
    ) {
      changeType = 'deleted';
      path = fromPath;
    } else {
      changeType = 'modified';
      path = toPath;
    }

    // Skip if we couldn't determine a path
    if (!path) continue;

    // Count additions and deletions, and collect content
    let additions = 0;
    let deletions = 0;
    let inHunk = false;
    const contentLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('@@')) {
        inHunk = true;
        continue;
      }
      if (inHunk) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          additions++;
          // Remove the leading '+' to get the actual content
          contentLines.push(line.slice(1));
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          deletions++;
        }
      }
    }

    // For deleted files, content is empty
    const content = changeType === 'deleted' ? '' : contentLines.join('\n');

    files.push({ path, changeType, content, additions, deletions });
  }

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
 * Represents the output of a bash command executed by the agent.
 */
export class BashArtifact {
  public readonly type = 'bashOutput';
  public readonly command: string;
  public readonly stdout: string;
  public readonly stderr: string;
  public readonly exitCode: number | null;

  constructor(artifact: RestBashOutputArtifact['bashOutput']) {
    this.command = artifact.command;
    this.stdout = artifact.output;
    this.stderr = '';
    this.exitCode = artifact.exitCode;
  }

  /**
   * Formats the bash output as a string, mimicking a terminal session.
   *
   * **Data Transformation:**
   * - Combines `stdout` and `stderr`.
   * - Formats the command with a `$` prompt.
   * - Appends the exit code.
   */
  toString(): string {
    const output = [this.stdout, this.stderr].filter(Boolean).join('');
    const commandLine = `$ ${this.command}`;
    const outputLine = output ? `${output}\n` : '';
    const exitLine = `[exit code: ${this.exitCode ?? 'N/A'}]`;
    return `${commandLine}\n${outputLine}${exitLine}`;
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
   * @returns Parsed diff with file paths, change types, and line counts.
   */
  parsed(): ParsedChangeSet {
    if (!this.gitPatch?.unidiffPatch) {
      return {
        files: [],
        summary: { totalFiles: 0, created: 0, modified: 0, deleted: 0 },
      };
    }
    const files = parseUnidiff(this.gitPatch.unidiffPatch);

    const summary = {
      totalFiles: files.length,
      created: files.filter((f) => f.changeType === 'created').length,
      modified: files.filter((f) => f.changeType === 'modified').length,
      deleted: files.filter((f) => f.changeType === 'deleted').length,
    };

    return { files, summary };
  }
}
