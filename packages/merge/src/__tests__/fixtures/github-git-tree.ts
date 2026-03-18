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
 * Mock Git tree operations.
 */

export async function getTree(
  _octokit: any,
  _owner: string,
  _repo: string,
  _tree_sha: string,
) {
  return {};
}

export async function createTree(
  _octokit: any,
  _owner: string,
  _repo: string,
  _base_tree: string,
  _tree: any[],
) {
  return { sha: 'new-tree-sha' };
}
