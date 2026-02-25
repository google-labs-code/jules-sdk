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
import type { PR } from '../../shared/schemas/pr.js';

/**
 * Select PRs using the `fleet-merge-ready` label.
 * Returns PRs sorted by number (oldest first) for deterministic ordering.
 */
export async function selectByLabel(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseBranch: string,
): Promise<PR[]> {
  const { data: pulls } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    base: baseBranch,
    per_page: 100,
  });

  const labeledPRs = pulls
    .filter((pr) =>
      pr.labels.some((label) => label.name === 'fleet-merge-ready'),
    )
    .sort((a, b) => a.number - b.number)
    .map(
      (pr): PR => ({
        number: pr.number,
        headRef: pr.head.ref,
        headSha: pr.head.sha,
        body: pr.body,
      }),
    );

  return labeledPRs;
}
