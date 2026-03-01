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
  ConflictEscalationSpec,
  ConflictEscalationInput,
  ConflictEscalationResult,
} from './spec.js';
import { ok } from '../../shared/result/ok.js';
import { fail } from '../../shared/result/fail.js';

/** Check run name used by the conflict-detection workflow */
const CONFLICT_CHECK_NAME = 'check-conflicts';

interface ConflictOutput {
  files: string[];
  rawOutput: string;
}

type JulesSessionFactory = () => Promise<{
  session: (opts: {
    prompt: string;
    source: { github: string; baseBranch: string };
    requireApproval: boolean;
    autoPr: boolean;
  }) => Promise<{ id: string }>;
}>;

export class ConflictEscalationHandler implements ConflictEscalationSpec {
  constructor(
    private octokit: Octokit,
    private julesFactory: JulesSessionFactory,
  ) {}

  async execute(input: ConflictEscalationInput): Promise<ConflictEscalationResult> {
    try {
      // 1. Count consecutive conflict-detection failures
      let failureCount: number;
      try {
        failureCount = await this.countConflictFailures(input);
      } catch (error: any) {
        return fail(
          'CHECK_RUNS_API_ERROR',
          `Failed to query check runs: ${error instanceof Error ? error.message : String(error)}`,
          true,
        );
      }

      // 2. No conflict runs at all
      if (failureCount === -1) {
        return fail(
          'NO_CONFLICT_RUNS',
          `No conflict-detection check runs found for PR #${input.prNumber}.`,
          true,
        );
      }

      // 3. Below threshold — Jules is still retrying natively
      if (failureCount < input.failureThreshold) {
        return fail(
          'BELOW_THRESHOLD',
          `Only ${failureCount} conflict-detection failure(s) (threshold: ${input.failureThreshold}). Jules is still retrying.`,
          true,
        );
      }

      // 4. Extract conflict details from the latest failed run
      let conflictOutput: ConflictOutput;
      try {
        conflictOutput = await this.getConflictOutput(input);
      } catch {
        // Non-fatal — proceed with empty context
        conflictOutput = { files: [], rawOutput: '' };
      }

      // 5. Dispatch a fresh Jules session to the existing PR branch
      let sessionId: string;
      try {
        sessionId = await this.dispatchSession(input, conflictOutput);
      } catch (error: any) {
        return fail(
          'SESSION_DISPATCH_FAILED',
          `Failed to dispatch Jules session: ${error instanceof Error ? error.message : String(error)}`,
          false,
        );
      }

      return ok({
        sessionId,
        failureCount,
        conflictFiles: conflictOutput.files,
      });
    } catch (error: any) {
      return fail(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }
  }

  /**
   * Counts consecutive conflict-detection failures for a PR.
   * Returns -1 if no conflict-detection check runs were found.
   */
  async countConflictFailures(input: ConflictEscalationInput): Promise<number> {
    // Get the PR to find the head SHA
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner: input.owner,
      repo: input.repo,
      pull_number: input.prNumber,
    });

    // List check runs for the head SHA
    const { data: checkRuns } = await this.octokit.rest.checks.listForRef({
      owner: input.owner,
      repo: input.repo,
      ref: pr.head.sha,
    });

    // Filter for conflict-detection runs
    const conflictRuns = checkRuns.check_runs.filter(
      (run) => run.name.includes(CONFLICT_CHECK_NAME),
    );

    if (conflictRuns.length === 0) {
      return -1;
    }

    // Count consecutive failures (most recent first)
    const sorted = conflictRuns.sort(
      (a, b) => new Date(b.started_at ?? 0).getTime() - new Date(a.started_at ?? 0).getTime(),
    );

    let consecutiveFailures = 0;
    for (const run of sorted) {
      if (run.conclusion === 'failure') {
        consecutiveFailures++;
      } else {
        break;
      }
    }

    return consecutiveFailures;
  }

  /**
   * Extracts conflict file information from the latest failed check run's output.
   */
  private async getConflictOutput(input: ConflictEscalationInput): Promise<ConflictOutput> {
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner: input.owner,
      repo: input.repo,
      pull_number: input.prNumber,
    });

    const { data: checkRuns } = await this.octokit.rest.checks.listForRef({
      owner: input.owner,
      repo: input.repo,
      ref: pr.head.sha,
    });

    const failedRun = checkRuns.check_runs
      .filter((run) => run.name.includes(CONFLICT_CHECK_NAME) && run.conclusion === 'failure')
      .sort(
        (a, b) => new Date(b.started_at ?? 0).getTime() - new Date(a.started_at ?? 0).getTime(),
      )[0];

    if (!failedRun?.output?.text) {
      return { files: [], rawOutput: '' };
    }

    const rawOutput = failedRun.output.text;

    // Try to parse the structured JSON from check-conflicts output
    const files: string[] = [];
    try {
      const parsed = JSON.parse(rawOutput);
      if (parsed.data?.affectedFiles) {
        for (const file of parsed.data.affectedFiles) {
          files.push(file.filePath);
        }
      }
    } catch {
      // Output might not be valid JSON — extract file paths heuristically
      const filePathRegex = /"filePath"\s*:\s*"([^"]+)"/g;
      let match;
      while ((match = filePathRegex.exec(rawOutput)) !== null) {
        files.push(match[1]);
      }
    }

    return { files, rawOutput };
  }

  /**
   * Dispatches a fresh Jules session targeting the PR's existing branch.
   * Does NOT close the PR — Jules pushes to the same branch.
   */
  private async dispatchSession(
    input: ConflictEscalationInput,
    conflictOutput: ConflictOutput,
  ): Promise<string> {
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner: input.owner,
      repo: input.repo,
      pull_number: input.prNumber,
    });

    const contextLines = [
      '⚠️ CONFLICT ESCALATION — AUTOMATED RE-DISPATCH',
      '',
      `PR #${input.prNumber} has failed conflict detection ${input.failureThreshold}+ times.`,
      `The original Jules session exhausted its native CI fix retries.`,
      '',
      `Branch: ${pr.head.ref}`,
      `Base: ${input.baseBranch}`,
      '',
    ];

    if (conflictOutput.files.length > 0) {
      contextLines.push('Conflicting files:');
      for (const file of conflictOutput.files) {
        contextLines.push(`  - ${file}`);
      }
      contextLines.push('');
    }

    if (conflictOutput.rawOutput) {
      contextLines.push('## Conflict Details (from check-conflicts)');
      contextLines.push('```json');
      contextLines.push(conflictOutput.rawOutput.slice(0, 4000));
      contextLines.push('```');
      contextLines.push('');
    }

    contextLines.push(
      'Resolve the merge conflicts in the files listed above.',
      'Fetch the latest base branch, merge it into this branch, and resolve all conflicts.',
      'Push the fix to this branch — do NOT create a new PR.',
    );

    const prompt = contextLines.join('\n');

    const jules = await this.julesFactory();
    const session = await jules.session({
      prompt,
      source: {
        github: `${input.owner}/${input.repo}`,
        baseBranch: pr.head.ref, // Target the PR branch, not base
      },
      requireApproval: false,
      autoPr: false, // Don't create a new PR
    });

    return session.id;
  }
}
