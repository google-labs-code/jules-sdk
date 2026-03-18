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
 * Mock Git commit operations.
 */

let commitCounter = 0;
export function resetCommitCounter() {
  commitCounter = 0;
}
export async function createCommit(
  _octokit: any,
  _owner: string,
  _repo: string,
  _message: string,
  _tree: string,
  parents: string[],
) {
  commitCounter++;
  return { sha: `new-commit-sha-${commitCounter}`, parents };
}
