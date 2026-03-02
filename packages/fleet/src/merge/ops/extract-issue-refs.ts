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

interface ClosingIssuesResponse {
  repository: {
    pullRequest: {
      closingIssuesReferences: {
        nodes: Array<{ number: number }>;
      };
    };
  };
}

/**
 * Fetches the GitHub issues that a PR would close on merge,
 * using the GraphQL `closingIssuesReferences` field.
 * This is the same source of truth GitHub uses to auto-close issues.
 * Returns unique issue numbers sorted ascending, or empty array on failure.
 */
export async function getClosingIssueRefs(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<number[]> {
  try {
    const result = await octokit.graphql<ClosingIssuesResponse>(
      `query($owner: String!, $repo: String!, $pr: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $pr) {
            closingIssuesReferences(first: 50) {
              nodes { number }
            }
          }
        }
      }`,
      { owner, repo, pr: prNumber },
    );

    return result.repository.pullRequest.closingIssuesReferences.nodes
      .map((n) => n.number)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}
