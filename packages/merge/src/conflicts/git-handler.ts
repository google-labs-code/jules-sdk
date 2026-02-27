// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { readFile } from 'node:fs/promises';
import type { GitCheckSpec, GitCheckInput, GitCheckResult } from './git-spec.js';
import { ok, fail } from '../shared/result.js';
import { gitStatusUnmerged, gitMergeBase } from '../shared/git.js';

export class GitCheckHandler implements GitCheckSpec {
  async execute(input: GitCheckInput): Promise<GitCheckResult> {
    try {
      // 1. Get unmerged files
      const statusResult = await gitStatusUnmerged();
      if (!statusResult.ok) {
        return fail(
          'GIT_STATUS_FAILED',
          `Failed to get git status: ${statusResult.error}`,
          true,
          'Ensure git is available and the working directory is a repository.',
        );
      }

      const unmergedFiles = statusResult.data;

      // 2. No conflicts
      if (unmergedFiles.length === 0) {
        return fail(
          'NO_UNMERGED_FILES',
          'No unmerged files found. The merge conflict may have already been resolved.',
          false,
        );
      }

      // 3. Read files and extract conflict markers
      const affectedFiles = await Promise.all(
        unmergedFiles.map(async (filePath) => {
          let content: string;
          try {
            content = await readFile(filePath, 'utf-8');
          } catch (error: any) {
            return {
              filePath,
              baseCommitSha: '',
              gitConflictMarkers: `[Error reading file: ${error.message}]`,
            };
          }

          // Extract conflict marker blocks
          const markers = extractConflictMarkers(content);

          return {
            filePath,
            baseCommitSha: '', // Will be filled in below
            gitConflictMarkers: markers,
          };
        }),
      );

      // 4. Get merge base SHA
      const mergeBaseResult = await gitMergeBase(input.failingCommitSha, 'HEAD');
      const baseSha = mergeBaseResult.ok ? mergeBaseResult.data : 'unknown';

      // Set baseSha on all affected files
      for (const file of affectedFiles) {
        file.baseCommitSha = baseSha;
      }

      // 5. Build task directive
      const taskDirective = [
        `MERGE CONFLICT RESOLUTION REQUIRED for PR #${input.pullRequestNumber}.`,
        `Failing commit: ${input.failingCommitSha}.`,
        `${affectedFiles.length} file(s) have unresolved conflicts.`,
        `Review the gitConflictMarkers for each file and rewrite the code to resolve all conflicts.`,
      ].join('\n');

      return ok({
        taskDirective,
        priority: 'critical' as const,
        affectedFiles,
      });
    } catch (error: any) {
      return fail(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }
  }
}

/**
 * Extract conflict marker blocks from file content.
 * Each block starts with <<<<<<< and ends with >>>>>>>.
 */
function extractConflictMarkers(content: string): string {
  const lines = content.split('\n');
  const blocks: string[] = [];
  let inConflict = false;
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      inConflict = true;
      currentBlock = [line];
    } else if (line.startsWith('>>>>>>>') && inConflict) {
      currentBlock.push(line);
      blocks.push(currentBlock.join('\n'));
      inConflict = false;
      currentBlock = [];
    } else if (inConflict) {
      currentBlock.push(line);
    }
  }

  return blocks.join('\n---\n');
}
