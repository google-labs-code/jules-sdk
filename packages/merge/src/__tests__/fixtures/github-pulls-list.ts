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
 * Mock pull request list operations.
 */

import { state } from './github-state.js';

export async function listPullRequests(
  _octokit: any,
  _owner: string,
  _repo: string,
  head: string,
  _base: string,
  _state: string = 'open',
) {
  const stored = state.pullRequests?.[head];
  return stored ? [stored] : [];
}

export async function listOpenPullRequests(
  _octokit: any,
  _owner: string,
  _repo: string,
  base: string,
  options?: { labels?: string[] },
) {
  let prs = state.openPrs?.[base] ?? [];
  if (options?.labels && options.labels.length > 0) {
    prs = prs.filter((pr: any) =>
      pr.labels?.some((l: string) => options.labels!.includes(l)),
    );
  }
  return prs;
}
