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
 * Pull request list operations.
 */

import { Octokit } from '@octokit/rest';

export async function listPullRequests(
  octokit: Octokit,
  owner: string,
  repo: string,
  head: string,
  base: string,
  state: 'open' | 'closed' | 'all' = 'open',
) {
  const { data } = await octokit.pulls.list({
    owner,
    repo,
    head: `${owner}:${head}`,
    base,
    state,
    per_page: 1,
  });
  return data;
}

export async function listOpenPullRequests(
  octokit: Octokit,
  owner: string,
  repo: string,
  base: string,
  options?: { labels?: string[] },
): Promise<{ number: number; head: { sha: string; ref: string } }[]> {
  const allPrs: { number: number; head: { sha: string; ref: string } }[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await octokit.pulls.list({
      owner,
      repo,
      state: 'open',
      base,
      per_page: perPage,
      page,
    });

    if (data.length === 0) break;

    for (const pr of data) {
      // Apply label filtering if specified
      if (options?.labels && options.labels.length > 0) {
        const prLabels = pr.labels.map((l: any) =>
          typeof l === 'string' ? l : l.name,
        );
        const hasMatchingLabel = options.labels.some((filterLabel) =>
          prLabels.includes(filterLabel),
        );
        if (!hasMatchingLabel) continue;
      }
      allPrs.push({
        number: pr.number,
        head: { sha: pr.head.sha, ref: pr.head.ref },
      });
    }

    if (data.length < perPage) break;
    page++;
  }

  return allPrs;
}
