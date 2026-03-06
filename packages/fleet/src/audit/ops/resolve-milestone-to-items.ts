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
import type { NodeRef } from '../graph/types.js';

/**
 * Resolve a milestone to all its associated issues and PRs.
 * Returns NodeRef[] for each item in the milestone.
 */
export async function resolveMilestoneToItems(
  octokit: Octokit,
  owner: string,
  repo: string,
  milestoneNumber: number,
): Promise<NodeRef[]> {
  const refs: NodeRef[] = [];

  // Fetch issues in the milestone (paginated)
  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    milestone: String(milestoneNumber),
    state: 'all',
    per_page: 100,
  });

  for (const item of issues) {
    if (item.pull_request) {
      refs.push({ kind: 'pr', id: String(item.number) });
    } else {
      refs.push({ kind: 'issue', id: String(item.number) });
    }
  }

  return refs;
}
