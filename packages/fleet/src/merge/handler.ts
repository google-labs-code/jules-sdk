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
import type {
  MergeInput,
  MergeResult,
  MergeSpec,
} from './spec.js';
import type { PR } from '../shared/schemas/pr.js';
import { ok, fail } from '../shared/result/index.js';
import { selectByLabel } from './select/by-label.js';
import { selectByFleetRun } from './select/by-fleet-run.js';
import { updateBranch } from './ops/update-branch.js';
import { waitForCI } from './ops/wait-for-ci.js';
import { squashMerge } from './ops/squash-merge.js';
import { redispatch } from './ops/redispatch.js';

/** Default delay helper */
const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * MergeHandler implements the sequential merge loop.
 * All GitHub interactions go through Octokit REST API.
 * Never throws — all errors returned as Result.
 */
export class MergeHandler implements MergeSpec {
  private sleep: (ms: number) => Promise<void>;

  constructor(
    private octokit: Octokit,
    private log: (msg: string) => void = console.log,
    sleep?: (ms: number) => Promise<void>,
  ) {
    this.sleep = sleep ?? defaultSleep;
  }

  async execute(input: MergeInput): Promise<MergeResult> {
    try {
      // 1. Select PRs based on mode
      const prs = await this.selectPRs(input);

      if (prs.length === 0) {
        this.log('ℹ️  No PRs found matching selection criteria.');
        return ok({ merged: [], skipped: [], redispatched: [] });
      }

      this.log(`Found ${prs.length} PR(s) to merge.`);

      const merged: number[] = [];
      const skipped: number[] = [];
      const redispatched: Array<{ oldPr: number; newPr: number }> = [];

      // 2. Sequential merge loop
      for (const pr of prs) {
        let currentPr = pr;
        let retryCount = 0;
        let prMerged = false;

        while (!prMerged) {
          const retryLabel =
            retryCount > 0 ? ` (retry ${retryCount})` : '';
          this.log(
            `\n📦 Processing PR #${currentPr.number}${retryLabel}`,
          );

          // Update branch from base (skip for first PR on first attempt)
          if (prs.indexOf(pr) > 0 || retryCount > 0) {
            const updateResult = await updateBranch(
              this.octokit,
              input.owner,
              input.repo,
              currentPr.number,
              this.log,
            );

            if (!updateResult.ok && updateResult.conflict) {
              // If re-dispatch is disabled, fail immediately on conflict
              if (!input.reDispatch) {
                return fail(
                  'CONFLICT_RETRIES_EXHAUSTED',
                  `Merge conflict detected for PR #${currentPr.number}. Use --re-dispatch to automatically retry.`,
                  false,
                  `Review PR: https://github.com/${input.owner}/${input.repo}/pull/${currentPr.number}`,
                );
              }

              if (retryCount >= input.maxRetries) {
                return fail(
                  'CONFLICT_RETRIES_EXHAUSTED',
                  `Conflict persists for PR #${currentPr.number} after ${input.maxRetries} retries. Human intervention required.`,
                  false,
                  `Review PR: https://github.com/${input.owner}/${input.repo}/pull/${currentPr.number}`,
                );
              }

              this.log(
                `  ⚠️ Merge conflict detected. Re-dispatching...`,
              );

              const newPr = await redispatch(
                this.octokit,
                input.owner,
                input.repo,
                currentPr,
                input.baseBranch,
                input.pollTimeoutSeconds,
                this.log,
                this.sleep,
              );

              if (!newPr) {
                return fail(
                  'REDISPATCH_TIMEOUT',
                  `Timed out waiting for re-dispatched PR for #${currentPr.number}.`,
                  true,
                );
              }

              redispatched.push({
                oldPr: currentPr.number,
                newPr: newPr.number,
              });
              currentPr = newPr;
              retryCount++;
              continue;
            }

            if (!updateResult.ok && !updateResult.conflict) {
              return fail(
                'GITHUB_API_ERROR',
                `Failed to update branch for PR #${currentPr.number}: ${updateResult.error}`,
                true,
              );
            }

            // Wait for update to propagate
            await this.sleep(5_000);
          }

          // Wait for CI
          this.log(`  🧪 Waiting for CI on PR #${currentPr.number}...`);
          const ciResult = await waitForCI(
            this.octokit,
            input.owner,
            input.repo,
            currentPr.number,
            input.maxCIWaitSeconds * 1000,
            this.log,
            this.sleep,
          );

          if (ciResult === 'none') {
            this.log(
              `  ℹ️  No CI checks configured. Proceeding.`,
            );
          } else if (ciResult === 'fail') {
            this.log(
              `  ❌ CI failed for PR #${currentPr.number}. Skipping.`,
            );
            skipped.push(currentPr.number);
            break;
          } else if (ciResult === 'timeout') {
            this.log(
              `  ⏰ CI timeout for PR #${currentPr.number}. Skipping.`,
            );
            skipped.push(currentPr.number);
            break;
          }

          // Merge
          this.log(
            `  ✅ CI passed. Merging PR #${currentPr.number}...`,
          );
          const mergeResult = await squashMerge(
            this.octokit,
            input.owner,
            input.repo,
            currentPr.number,
          );

          if (!mergeResult.ok) {
            return fail(
              'MERGE_FAILED',
              `Failed to merge PR #${currentPr.number}: ${mergeResult.error}`,
              false,
            );
          }

          this.log(`  🎉 PR #${currentPr.number} merged successfully.`);
          merged.push(currentPr.number);
          prMerged = true;
        }

        // Brief pause for merge to propagate before next PR
        await this.sleep(5_000);
      }

      this.log(`\n✅ Sequential merge complete.`);
      return ok({ merged, skipped, redispatched });
    } catch (error) {
      return fail(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }
  }

  // ── Private helpers ────────────────────────────────────────────────

  private async selectPRs(input: MergeInput): Promise<PR[]> {
    if (input.mode === 'fleet-run') {
      return selectByFleetRun(
        this.octokit,
        input.owner,
        input.repo,
        input.baseBranch,
        input.runId!,
      );
    }
    return selectByLabel(
      this.octokit,
      input.owner,
      input.repo,
      input.baseBranch,
    );
  }
}
