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

/**
 * Squash-merges a PR via the GitHub REST API.
 */
export async function squashMerge(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: prNumber,
      merge_method: 'squash',
    });
    return { ok: true };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}
