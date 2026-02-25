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
 * Closes a conflicting PR and re-dispatches via Jules SDK.
 * Polls for the new PR and returns it, or null on timeout.
 */
export async function redispatch(
  octokit: Octokit,
  owner: string,
  repo: string,
  oldPr: PR,
  baseBranch: string,
  pollTimeoutSeconds: number,
  log: (msg: string) => void,
  sleep: (ms: number) => Promise<void>,
): Promise<PR | null> {
  // Close the conflicting PR
  log(`  🔒 Closing conflicting PR #${oldPr.number}...`);
  try {
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: oldPr.number,
      state: 'closed',
      body: `${oldPr.body ?? ''}\n\n---\n⚠️ Closed by fleet-merge: merge conflict detected. Task re-dispatched.`,
    });
  } catch {
    log(
      `  ⚠️ Failed to close PR #${oldPr.number}, continuing...`,
    );
  }

  // Re-dispatch via Jules SDK
  log(`  🚀 Re-dispatching against current ${baseBranch}...`);
  try {
    const { jules } = await import('@google/jules-sdk');
    const session = await jules.session({
      prompt: oldPr.body ?? '',
      source: {
        github: `${owner}/${repo}`,
        baseBranch,
      },
    });
    log(`  📝 New session: ${session.id}`);

    // Poll for new PR
    log(`  ⏳ Waiting for new PR from session ${session.id}...`);
    const start = Date.now();
    const timeoutMs = pollTimeoutSeconds * 1000;
    const pollIntervalMs = 30_000;

    while (Date.now() - start < timeoutMs) {
      await sleep(pollIntervalMs);
      const { data: pulls } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: 'open',
        base: baseBranch,
        per_page: 100,
      });

      const newPr = pulls.find(
        (pr) =>
          pr.head.ref.includes(session.id) ||
          pr.body?.includes(session.id),
      );

      if (newPr) {
        log(
          `  ✅ New PR #${newPr.number} found (${newPr.head.ref})`,
        );
        return {
          number: newPr.number,
          headRef: newPr.head.ref,
          headSha: newPr.head.sha,
          body: newPr.body,
        };
      }

      log(`  ⏳ No PR yet... polling again in 30s`);
    }
  } catch (error) {
    log(
      `  ❌ Re-dispatch failed: ${error instanceof Error ? error.message : error}`,
    );
  }

  return null;
}
