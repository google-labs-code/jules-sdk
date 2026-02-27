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

import type { Octokit } from '@octokit/rest';
import type { JulesClient } from '@google/jules-sdk';
import type { SessionCheckSpec, SessionCheckInput, SessionCheckResult } from './session-spec.js';
import { ok, fail } from '../shared/result.js';
import { getSessionChangedFiles } from '../shared/session.js';
import { compareCommits, getFileContent } from '../shared/github.js';

export class SessionCheckHandler implements SessionCheckSpec {
  constructor(
    private octokit: Octokit,
    private julesClient: JulesClient,
  ) {}

  async execute(input: SessionCheckInput): Promise<SessionCheckResult> {
    try {
      const [owner, repo] = input.repo.split('/');

      // 1. Session changed files via Jules SDK
      let sessionPaths: string[];
      try {
        const sessionFiles = await getSessionChangedFiles(
          this.julesClient,
          input.sessionId,
        );
        sessionPaths = sessionFiles.map((f) => f.path);
      } catch (error: any) {
        return fail(
          'SESSION_QUERY_FAILED',
          `Failed to query session ${input.sessionId}: ${error.message}`,
          true,
          'Verify the session ID is correct and JULES_API_KEY is set.',
        );
      }

      // 2. Remote changed files via GitHub API
      let remoteFiles: string[];
      try {
        remoteFiles = await compareCommits(
          this.octokit,
          owner,
          repo,
          input.base,
          'HEAD',
        );
      } catch (error: any) {
        return fail(
          'GITHUB_API_ERROR',
          `Failed to compare commits: ${error.message}`,
          true,
          'Check GITHUB_TOKEN and repository access.',
        );
      }

      // 3. Intersect session files with remote changes
      const remoteSet = new Set(remoteFiles);
      const overlapping = sessionPaths.filter((f) => remoteSet.has(f));

      // 4. Clean
      if (overlapping.length === 0) {
        return ok({
          status: 'clean' as const,
          message: 'No conflicts detected.',
          conflicts: [],
        });
      }

      // 5. Build shadow content for each overlapping file
      const conflicts = await Promise.all(
        overlapping.map(async (filePath) => {
          const remoteShadowContent = await getFileContent(
            this.octokit,
            owner,
            repo,
            filePath,
            input.base,
          );
          return {
            filePath,
            conflictReason:
              'Remote commit modified this file since branch creation.',
            remoteShadowContent,
          };
        }),
      );

      return ok({
        status: 'conflict' as const,
        message: `The remote ${input.base} branch has advanced. Rebase required for ${overlapping.join(', ')}.`,
        conflicts,
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
