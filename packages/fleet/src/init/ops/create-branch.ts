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

import type { Octokit } from 'octokit';
import { fail } from '../../shared/result/index.js';
import type { InitResult } from '../spec.js';

/**
 * Create the fleet-init branch from the base branch SHA.
 * Returns the branch name on success, or a fail Result.
 */
export async function createBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseBranch: string,
  log: (msg: string) => void,
): Promise<{ branchName: string; baseSha: string } | InitResult> {
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });
  const baseSha = refData.object.sha;

  const branchName = `fleet-init-${Date.now()}`;
  log(`  🌿 Creating branch: ${branchName}`);

  try {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });
  } catch (error) {
    return fail(
      'BRANCH_CREATE_FAILED',
      `Failed to create branch "${branchName}": ${error instanceof Error ? error.message : error}`,
      true,
    );
  }

  return { branchName, baseSha };
}

/** Type guard: returns true if the result is a fail Result (not a branch info object) */
export function isBranchResult(
  result: { branchName: string; baseSha: string } | InitResult,
): result is InitResult {
  return 'success' in result;
}
