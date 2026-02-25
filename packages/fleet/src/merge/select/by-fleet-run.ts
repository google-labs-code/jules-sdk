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

/** Fleet-run marker embedded in PR bodies for batch tracking */
const FLEET_RUN_MARKER_PREFIX = '<!-- fleet-run:';

/**
 * Select PRs by fleet-run ID embedded in PR body.
 * Matches `<!-- fleet-run: <ID> -->` marker.
 * Returns PRs sorted by number (oldest first).
 */
export async function selectByFleetRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseBranch: string,
  runId: string,
): Promise<PR[]> {
  const { data: pulls } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    base: baseBranch,
    per_page: 100,
  });

  const marker = `${FLEET_RUN_MARKER_PREFIX} ${runId} -->`;

  const matchingPRs = pulls
    .filter((pr) => pr.body?.includes(marker))
    .sort((a, b) => a.number - b.number)
    .map(
      (pr): PR => ({
        number: pr.number,
        headRef: pr.head.ref,
        headSha: pr.head.sha,
        body: pr.body,
      }),
    );

  return matchingPRs;
}
