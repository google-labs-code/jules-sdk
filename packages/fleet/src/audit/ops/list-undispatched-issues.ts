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

export interface UndispatchedIssue {
  number: number;
  title: string;
  labels: string[];
  milestone?: string;
}

/**
 * List fleet-labeled issues that do not have a corresponding open PR.
 * These are candidates for dispatch to Jules.
 */
export async function listUndispatchedIssues(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<UndispatchedIssue[]> {
  // Fetch open issues with fleet label
  const { data: issues } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: 'open',
    labels: 'fleet',
    per_page: 100,
  });

  // Filter out pull requests (GitHub API returns PRs in issue listings)
  const actualIssues = issues.filter((i) => !i.pull_request);

  // Fetch open PRs to check for linked dispatches
  const { data: pulls } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });

  // Build set of issue numbers that have an open PR fixing them
  const issueFixes = new Set<number>();
  for (const pr of pulls) {
    // Check PR body for "Fixes #N" references
    const matches = pr.body?.matchAll(/(?:fixes|closes|resolves)\s+#(\d+)/gi) ?? [];
    for (const match of matches) {
      issueFixes.add(Number(match[1]));
    }
  }

  // Return fleet issues that have no open PR fixing them
  return actualIssues
    .filter((issue) => !issueFixes.has(issue.number))
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      labels: issue.labels
        .map((l) => (typeof l === 'string' ? l : l.name ?? ''))
        .filter(Boolean),
      milestone: issue.milestone?.title,
    }));
}
