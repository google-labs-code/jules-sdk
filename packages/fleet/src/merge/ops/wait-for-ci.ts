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
import type { FleetEmitter } from '../../shared/events.js';

/**
 * Polls GitHub Checks API until all checks complete or timeout.
 * Returns 'pass', 'fail', 'none' (no checks configured), or 'timeout'.
 */
export async function waitForCI(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  maxWaitMs: number,
  emit: FleetEmitter,
  sleep: (ms: number) => Promise<void>,
): Promise<'pass' | 'fail' | 'none' | 'timeout'> {
  const { data: prData } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });
  const headSha = prData.head.sha;

  emit({ type: 'merge:ci:waiting', prNumber });

  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { data } = await octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: headSha,
    });

    if (data.check_runs.length === 0) {
      emit({ type: 'merge:ci:none', prNumber });
      return 'none';
    }

    // Emit status for each check run
    for (const run of data.check_runs) {
      if (run.status === 'completed') {
        const passed = run.conclusion === 'success' || run.conclusion === 'skipped';
        const durationMs = run.started_at && run.completed_at
          ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
          : undefined;
        emit({
          type: 'merge:ci:check',
          name: run.name,
          status: passed ? 'pass' : 'fail',
          duration: durationMs ? Math.round(durationMs / 1000) : undefined,
        });
      }
    }

    const allComplete = data.check_runs.every(
      (run) => run.status === 'completed',
    );
    const allPassed = data.check_runs.every(
      (run) =>
        run.conclusion === 'success' || run.conclusion === 'skipped',
    );

    if (allComplete && allPassed) {
      emit({ type: 'merge:ci:passed', prNumber });
      return 'pass';
    }
    if (allComplete && !allPassed) {
      emit({ type: 'merge:ci:failed', prNumber });
      return 'fail';
    }

    await sleep(30_000);
  }

  emit({ type: 'merge:ci:timeout', prNumber });
  return 'timeout';
}
