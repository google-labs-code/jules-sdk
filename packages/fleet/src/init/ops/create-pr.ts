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
import { buildInitPRBody } from './pr-body.js';

/**
 * Create the fleet initialization PR.
 * Returns { prUrl, prNumber } on success, or a fail Result.
 */
export async function createInitPR(
  ctx: InitContext,
  baseBranch: string,
  filesCreated: string[],
): Promise<{ prUrl: string; prNumber: number } | InitResult> {
  ctx.emit({ type: 'init:pr:creating' });

  try {
    const { data: pr } = await ctx.octokit.rest.pulls.create({
      owner: ctx.owner,
      repo: ctx.repo,
      title: 'chore: initialize fleet workflows',
      body: buildInitPRBody(filesCreated),
      head: ctx.branchName,
      base: baseBranch,
    });
    ctx.emit({ type: 'init:pr:created', url: pr.html_url, number: pr.number });
    return { prUrl: pr.html_url, prNumber: pr.number };
  } catch (error) {
    return fail(
      'PR_CREATE_FAILED',
      `Failed to create PR: ${error instanceof Error ? error.message : error}`,
      true,
    );
  }
}

/** Type guard: returns true if the result is a fail Result */
export function isPRResult(
  result: { prUrl: string; prNumber: number } | InitResult,
): result is InitResult {
  return 'success' in result;
}
