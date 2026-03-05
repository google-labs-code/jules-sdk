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

/**
 * Copy milestone from a source issue to a target issue/PR.
 * Resolves the milestone by title to find its number.
 */
export async function copyMilestone(
  octokit: Octokit,
  owner: string,
  repo: string,
  targetNumber: number,
  milestoneTitle: string,
): Promise<boolean> {
  // Find milestone by title
  const { data: milestones } = await octokit.rest.issues.listMilestones({
    owner,
    repo,
    state: 'open',
  });

  const match = milestones.find(
    (m) => m.title.toLowerCase() === milestoneTitle.toLowerCase(),
  );
  if (!match) return false;

  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: targetNumber,
    milestone: match.number,
  });

  return true;
}
