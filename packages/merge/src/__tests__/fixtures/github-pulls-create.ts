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
 * Mock pull request create operation.
 */

import { state } from './github-state.js';

export async function createPullRequest(
  _octokit: any,
  _owner: string,
  _repo: string,
  title: string,
  head: string,
  _base: string,
  _body?: string,
) {
  const pr = {
    number: 999,
    html_url: 'https://github.com/owner/repo/pull/999',
    title,
  };
  state.pullRequests = state.pullRequests ?? {};
  state.pullRequests[head] = pr;
  return pr;
}
