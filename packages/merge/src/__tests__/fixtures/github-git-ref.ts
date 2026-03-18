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
 * Mock Git ref operations.
 */

import { state } from './github-state.js';

export async function createRef(
  _octokit: any,
  _owner: string,
  _repo: string,
  ref: string,
  sha: string,
) {
  state.refs[ref] = sha;
  return { ref, sha };
}

export async function updateRef(
  _octokit: any,
  _owner: string,
  _repo: string,
  ref: string,
  sha: string,
  _force: boolean = false,
) {
  if (!state.refs[ref]) throw new Error('Not found');
  state.refs[ref] = sha;
  return { ref, sha };
}

export async function deleteBranch(
  _octokit: any,
  _owner: string,
  _repo: string,
  _branch: string,
) {
  // no-op in tests
}
