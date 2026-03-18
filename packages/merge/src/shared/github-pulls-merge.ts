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

/**
 * Pull request merge operation.
 */

import { Octokit } from '@octokit/rest';

export async function mergePullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  pull_number: number,
  merge_method: 'merge' | 'squash' | 'rebase' = 'merge',
) {
  const { data } = await octokit.pulls.merge({
    owner,
    repo,
    pull_number,
    merge_method,
  });
  return data;
}
