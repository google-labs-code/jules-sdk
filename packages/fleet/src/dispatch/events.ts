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

/** Recorded dispatch event */
export interface DispatchRecord {
  commentId: number;
  timestamp: string;
}

/**
 * Appends a dispatch event comment to an issue.
 * This is the write side of the event-sourced pattern —
 * `getDispatchStatus` is the read side.
 */
export async function recordDispatch(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  sessionId: string,
): Promise<DispatchRecord> {
  const timestamp = new Date().toISOString();
  const body = [
    `🤖 **Fleet Dispatch Event**`,
    `Session: \`${sessionId}\``,
    `Timestamp: ${timestamp}`,
  ].join('\n');

  const { data: comment } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });

  return {
    commentId: comment.id,
    timestamp,
  };
}
