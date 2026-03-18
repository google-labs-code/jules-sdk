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
 * Git ref operations — create, update, delete.
 */

import { Octokit } from '@octokit/rest';

export async function createRef(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  sha: string,
) {
  const { data } = await octokit.git.createRef({ owner, repo, ref, sha });
  return data;
}

export async function updateRef(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  sha: string,
  force: boolean = false,
) {
  const { data } = await octokit.git.updateRef({
    owner,
    repo,
    ref: ref.replace(/^refs\//, ''),
    sha,
    force,
  });
  return data;
}

export async function deleteBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
) {
  await octokit.git.deleteRef({ owner, repo, ref: `heads/${branch}` });
}
