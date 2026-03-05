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
 * Resolve a PR to its linked issues via GitHub's GraphQL
 * `closingIssuesReferences`. Returns NodeRef[] for each linked issue.
 */
export async function resolvePRToIssues(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<NodeRef[]> {
  const query = `
    query ($owner: String!, $repo: String!, $prNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $prNumber) {
          closingIssuesReferences(first: 10) {
            nodes { number }
          }
        }
      }
    }
  `;

  const result: any = await octokit.graphql(query, { owner, repo, prNumber });
  const nodes =
    result?.repository?.pullRequest?.closingIssuesReferences?.nodes ?? [];

  return nodes.map((issue: any) => ({
    kind: 'issue' as const,
    id: String(issue.number),
  }));
}
