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

import { fail } from '../../shared/result/index.js';
import type { InitResult } from '../spec.js';
import type { InitContext } from '../types.js';
import type { WorkflowTemplate } from '../templates/types.js';

/**
 * Commit workflow templates and an example goal to the init branch.
 * Returns the list of files created, or a fail Result.
 */
export async function commitFiles(
  ctx: InitContext,
  templates: readonly WorkflowTemplate[],
  exampleGoal: string,
): Promise<string[] | InitResult> {
  const filesCreated: string[] = [];

  // Commit workflow templates
  for (const tmpl of templates) {
    try {
      await ctx.octokit.rest.repos.createOrUpdateFileContents({
        owner: ctx.owner,
        repo: ctx.repo,
        path: tmpl.repoPath,
        message: `chore: add ${tmpl.repoPath}`,
        content: Buffer.from(tmpl.content).toString('base64'),
        branch: ctx.branchName,
      });
      filesCreated.push(tmpl.repoPath);
      ctx.log(`  📄 Added: ${tmpl.repoPath}`);
    } catch (error: unknown) {
      const status =
        error && typeof error === 'object' && 'status' in error
          ? (error as { status: number }).status
          : 0;
      if (status === 422) {
        ctx.log(`  ⏭️  Already exists: ${tmpl.repoPath}`);
      } else {
        return fail(
          'FILE_COMMIT_FAILED',
          `Failed to commit "${tmpl.repoPath}": ${error instanceof Error ? error.message : error}`,
          true,
        );
      }
    }
  }

  // Commit example goal
  try {
    await ctx.octokit.rest.repos.createOrUpdateFileContents({
      owner: ctx.owner,
      repo: ctx.repo,
      path: '.fleet/goals/example.md',
      message: 'chore: add example fleet goal',
      content: Buffer.from(exampleGoal).toString('base64'),
      branch: ctx.branchName,
    });
    filesCreated.push('.fleet/goals/example.md');
    ctx.log(`  📄 Added: .fleet/goals/example.md`);
  } catch (error: unknown) {
    const status =
      error && typeof error === 'object' && 'status' in error
        ? (error as { status: number }).status
        : 0;
    if (status !== 422) {
      ctx.log(
        `  ⚠️ Failed to create example goal: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  return filesCreated;
}

/** Type guard: returns true if the result is a fail Result */
export function isCommitResult(
  result: string[] | InitResult,
): result is InitResult {
  return !Array.isArray(result);
}
