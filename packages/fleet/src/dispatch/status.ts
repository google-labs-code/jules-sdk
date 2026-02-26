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

/** Parsed dispatch event from a comment */
export interface DispatchEvent {
  sessionId: string;
  timestamp: string;
  commentId: number;
}

/** Lifecycle status of a dispatched issue */
export interface IssueDispatchStatus {
  number: number;
  open: boolean;
  labels: string[];
  dispatchEvent: DispatchEvent | null;
  linkedPRs: number[];
}

const DISPATCH_MARKER = '🤖 **Fleet Dispatch Event**';

/**
 * Reads each issue's comment log and returns factual lifecycle signals:
 * - Whether the issue is open/closed
 * - Whether it has a dispatch event comment (and the session ID)
 * - Which open PRs reference it
 *
 * Takes Octokit as a parameter for testability.
 */
export async function getDispatchStatus(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumbers: number[],
): Promise<IssueDispatchStatus[]> {
  // Fetch open PRs once to cross-reference
  const { data: openPRs } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });

  const results: IssueDispatchStatus[] = [];

  for (const issueNumber of issueNumbers) {
    const { data: issue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    });

    const dispatchComment = comments.find((c) =>
      c.body?.includes(DISPATCH_MARKER),
    );

    let dispatchEvent: DispatchEvent | null = null;
    if (dispatchComment?.body) {
      const sessionMatch = dispatchComment.body.match(/Session:\s*`([^`]+)`/);
      dispatchEvent = {
        sessionId: sessionMatch?.[1] ?? 'unknown',
        timestamp: dispatchComment.created_at,
        commentId: dispatchComment.id,
      };
    }

    const linkedPRs = openPRs
      .filter(
        (pr) =>
          pr.body?.includes(`#${issueNumber}`) ||
          pr.body?.includes(`Fixes #${issueNumber}`) ||
          pr.body?.includes(`Closes #${issueNumber}`),
      )
      .map((pr) => pr.number);

    results.push({
      number: issueNumber,
      open: issue.state === 'open',
      labels: (issue.labels ?? []).map((l: any) =>
        typeof l === 'string' ? l : l.name,
      ),
      dispatchEvent,
      linkedPRs,
    });
  }

  return results;
}
