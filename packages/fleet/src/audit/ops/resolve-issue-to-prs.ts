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
 * Resolve an issue to PRs that fix it by searching PRs with
 * `closingIssuesReferences` that include this issue number.
 *
 * Uses GitHub search API to find PRs referencing this issue.
 */
export async function resolveIssueToPRs(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<NodeRef[]> {
  // Use timeline events to find cross-referenced PRs
  const { data: timeline } = await octokit.rest.issues.listEventsForTimeline({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  const prRefs: NodeRef[] = [];
  const seen = new Set<number>();

  for (const event of timeline) {
    // cross-referenced events link PRs to issues
    if (
      event.event === 'cross-referenced' &&
      (event as any).source?.issue?.pull_request
    ) {
      const prNumber = (event as any).source.issue.number;
      if (!seen.has(prNumber)) {
        seen.add(prNumber);
        prRefs.push({ kind: 'pr', id: String(prNumber) });
      }
    }
  }

  return prRefs;
}
