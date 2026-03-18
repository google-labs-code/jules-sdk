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
 * Git tree operations — get and create trees.
 */

import { Octokit } from '@octokit/rest';

export async function getTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  tree_sha: string,
) {
  const { data } = await octokit.git.getTree({ owner, repo, tree_sha });
  return data;
}

export async function createTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  base_tree: string,
  tree: any[],
) {
  const { data } = await octokit.git.createTree({
    owner,
    repo,
    base_tree,
    tree,
  });
  return data;
}
