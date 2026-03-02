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
import type { FleetEmitter } from '../../shared/events.js';
import { jules } from '@google/jules-sdk';

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
  emit: FleetEmitter,
  sleep: (ms: number) => Promise<void>,
): Promise<PR | null> {
  emit({ type: 'merge:redispatch:start', oldPr: oldPr.number });

  // Close the conflicting PR
  try {
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: oldPr.number,
      state: 'closed',
      body: `${oldPr.body ?? ''}\n\n---\n⚠️ Closed by fleet-merge: merge conflict detected. Task re-dispatched.`,
    });
  } catch {
    // Non-fatal — continue with re-dispatch
  }

  // Re-dispatch via Jules SDK
  try {
    // Gather context: recently merged PRs and the closed PR's diff
    const [recentlyMerged, prDiff] = await Promise.all([
      getRecentlyMergedPRs(octokit, owner, repo, baseBranch),
      getClosedPRDiff(octokit, owner, repo, oldPr.number),
    ]);
    const contextBlock = buildRedispatchContext(oldPr, recentlyMerged, prDiff);
    const enrichedPrompt = `${contextBlock}\n\n---\n\n${oldPr.body ?? ''}`;

    const session = await jules.session({
      prompt: enrichedPrompt,
      source: {
        github: `${owner}/${repo}`,
        baseBranch,
      },
      requireApproval: false,
      autoPr: true,
    });

    emit({
      type: 'merge:redispatch:done',
      oldPr: oldPr.number,
      sessionId: session.id,
    });

    return null;
  } catch (error) {
    emit({
      type: 'error',
      code: 'REDISPATCH_FAILED',
      message: `Re-dispatch failed: ${error instanceof Error ? error.message : error}`,
    });
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────

interface MergedPRSummary {
  number: number;
  title: string;
}

/**
 * Fetches recently merged PRs into the base branch (last 10).
 */
async function getRecentlyMergedPRs(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseBranch: string,
): Promise<MergedPRSummary[]> {
  try {
    const { data: pulls } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'closed',
      base: baseBranch,
      sort: 'updated',
      direction: 'desc',
      per_page: 10,
    });
    return pulls
      .filter((pr) => pr.merged_at !== null)
      .map((pr) => ({ number: pr.number, title: pr.title }));
  } catch {
    return [];
  }
}

/**
 * Fetches the unified diff from a closed PR as reference implementation.
 * Returns empty string on failure (non-fatal).
 */
async function getClosedPRDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {
  try {
    const { data: diff } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: { format: 'diff' },
    });
    // diff comes as a string when using the diff media type
    const diffStr = diff as unknown as string;
    // Cap at ~8000 chars to avoid prompt bloat
    if (diffStr.length > 8000) {
      return diffStr.slice(0, 8000) + '\n... (diff truncated)';
    }
    return diffStr;
  } catch {
    return '';
  }
}

/**
 * Builds a context block for re-dispatched sessions so Jules knows
 * why the task is being re-tried and what's already been merged.
 */
function buildRedispatchContext(
  oldPr: PR,
  recentlyMerged: MergedPRSummary[],
  prDiff: string,
): string {
  const lines: string[] = [
    '⚠️ RE-DISPATCH CONTEXT',
    '',
    `This task was previously attempted in PR #${oldPr.number}, which was closed due to merge conflicts after other PRs were merged into the base branch.`,
    '',
  ];

  if (recentlyMerged.length > 0) {
    lines.push('The following PRs have been recently merged into the base branch:');
    for (const pr of recentlyMerged) {
      lines.push(`- PR #${pr.number}: ${pr.title}`);
    }
    lines.push('');
  }

  lines.push(
    'Your new PR must build on top of these merged changes. Do NOT duplicate work that already exists in the base branch.',
  );

  if (prDiff) {
    lines.push('');
    lines.push('## Reference Implementation (from closed PR)');
    lines.push('The diff below shows what the previous attempt implemented. Use it as a reference — adapt the changes to the current state of the codebase, resolving any conflicts with recently merged work.');
    lines.push('');
    lines.push('```diff');
    lines.push(prDiff);
    lines.push('```');
  }

  return lines.join('\n');
}

