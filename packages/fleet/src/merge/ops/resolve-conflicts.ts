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
import type { jules as JulesClient } from '@google/jules-sdk';
import { getConflictDetails } from './get-conflict-details.js';
import { getClosingIssueRefs } from './extract-issue-refs.js';

// ── Types ───────────────────────────────────────────────────────────

export interface BatchResolveInput {
  owner: string;
  repo: string;
  baseBranch: string;
  /** PRs that conflict with each other / with the current base */
  conflictingPRs: PR[];
  /** Files shared between the conflicting PRs */
  sharedFiles: string[];
  /** PRs that were recently merged (provides context) */
  recentlyMerged: number[];
}

export interface BatchResolveSuccess {
  success: true;
  sessionId: string;
  resolvedPRs: number[];
}

export interface BatchResolveFailure {
  success: false;
  error: string;
}

export type BatchResolveResult = BatchResolveSuccess | BatchResolveFailure;

// ── Constants ───────────────────────────────────────────────────────

/** Max characters per PR diff to avoid prompt bloat */
const MAX_DIFF_LENGTH = 8_000;

// ── Core ────────────────────────────────────────────────────────────

/**
 * Resolves a batch of conflicting PRs by dispatching a single Jules session
 * with all their diffs and context. Closes original PRs after dispatch.
 */
export async function batchResolveConflicts(
  octokit: Octokit,
  input: BatchResolveInput,
  emit: FleetEmitter,
  jules: typeof JulesClient,
): Promise<BatchResolveResult> {
  const { owner, repo, baseBranch, conflictingPRs, sharedFiles, recentlyMerged } = input;

  emit({
    type: 'merge:batch-resolve:start',
    prNumbers: conflictingPRs.map((p) => p.number),
    sharedFiles,
  });

  // 1. Fetch diffs for all conflicting PRs (non-fatal per-PR)
  const diffs = await fetchAllDiffs(octokit, owner, repo, conflictingPRs);

  // 1b. Fetch base branch content for conflicting files (non-fatal)
  const conflictDetails = await getConflictDetails(octokit, owner, repo, sharedFiles, baseBranch);

  // 1c. Fetch closing issue refs from all PRs via GraphQL
  const issueRefArrays = await Promise.all(
    conflictingPRs.map((pr) => getClosingIssueRefs(octokit, owner, repo, pr.number)),
  );
  const allIssueRefs = [...new Set(issueRefArrays.flat())].sort((a, b) => a - b);

  // 2. Build the combined prompt
  const prompt = buildBatchPrompt(input, diffs, conflictDetails, allIssueRefs);

  // 3. Dispatch a single Jules session
  let sessionId: string;
  try {
    const session = await jules.session({
      prompt,
      source: {
        github: `${owner}/${repo}`,
        baseBranch,
      },
      requireApproval: false,
      autoPr: true,
    });
    sessionId = session.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit({
      type: 'error',
      code: 'BATCH_RESOLVE_FAILED',
      message: `Batch resolve dispatch failed: ${message}`,
    });
    return { success: false, error: message };
  }

  // 4. Comment on each original PR (non-fatal)
  await commentOnPRs(octokit, owner, repo, conflictingPRs, sessionId);

  // 5. Close original PRs to prevent repeated redispatch on next cron run
  for (const pr of conflictingPRs) {
    try {
      await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: pr.number,
        state: 'closed',
        body: `${pr.body ?? ''}\n\n---\n⚠️ Closed by fleet-merge: batch conflict resolution dispatched (session ${sessionId}).`,
      });
    } catch {
      // Non-fatal — continue
    }
  }

  emit({
    type: 'merge:batch-resolve:done',
    sessionId,
    prNumbers: conflictingPRs.map((p) => p.number),
  });

  return {
    success: true,
    sessionId,
    resolvedPRs: conflictingPRs.map((p) => p.number),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Fetches the diff for each PR. Returns a map of PR number → diff string.
 * Non-fatal: returns empty string for PRs where the API call fails.
 */
async function fetchAllDiffs(
  octokit: Octokit,
  owner: string,
  repo: string,
  prs: PR[],
): Promise<Map<number, string>> {
  const diffs = new Map<number, string>();

  await Promise.all(
    prs.map(async (pr) => {
      try {
        const { data: diff } = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: pr.number,
          mediaType: { format: 'diff' },
        });
        const diffStr = diff as unknown as string;
        diffs.set(
          pr.number,
          diffStr.length > MAX_DIFF_LENGTH
            ? diffStr.slice(0, MAX_DIFF_LENGTH) + '\n... (diff truncated)'
            : diffStr,
        );
      } catch {
        diffs.set(pr.number, '');
      }
    }),
  );

  return diffs;
}

/**
 * Builds a comprehensive prompt for batch conflict resolution.
 * Exported for testing.
 */
export function buildBatchPrompt(
  input: BatchResolveInput,
  diffs: Map<number, string>,
  conflictDetails = '',
  issueRefs: number[] = [],
): string {
  const { conflictingPRs, sharedFiles, recentlyMerged, owner, repo } = input;
  const lines: string[] = [
    '⚠️ BATCH CONFLICT RESOLUTION',
    '',
    `The following ${conflictingPRs.length} PRs in ${owner}/${repo} conflict with the current base branch after recent merges.`,
    'Resolve all of them together in a single PR.',
    '',
  ];

  // Shared files summary
  lines.push('## Conflicting Files');
  lines.push('These files are touched by multiple PRs and likely contain conflicts:');
  for (const file of sharedFiles) {
    lines.push(`- \`${file}\``);
  }
  lines.push('');

  // Conflict details (base branch state)
  if (conflictDetails) {
    lines.push(conflictDetails);
    lines.push('');
  }

  // Recently merged context
  if (recentlyMerged.length > 0) {
    lines.push('## Recently Merged PRs');
    lines.push('These PRs were merged just before, and their changes are now in the base branch:');
    for (const num of recentlyMerged) {
      lines.push(`- PR #${num}`);
    }
    lines.push('');
  }

  // Per-PR details
  lines.push('## PRs to Resolve');
  for (const pr of conflictingPRs) {
    lines.push(`### PR #${pr.number}`);
    if (pr.body) {
      lines.push(pr.body);
    }
    const diff = diffs.get(pr.number);
    if (diff) {
      lines.push('');
      lines.push('```diff');
      lines.push(diff);
      lines.push('```');
    }
    lines.push('');
  }

  // Issue reference instructions
  if (issueRefs.length > 0) {
    lines.push('');
    lines.push('## Issue References');
    lines.push('Your new PR body MUST include the following to close the tracked issues:');
    for (const ref of issueRefs) {
      lines.push(`- Fixes #${ref}`);
    }
  }

  lines.push('');
  lines.push('## Instructions');
  lines.push('Create ONE PR that incorporates ALL changes from the listed PRs above,');
  lines.push('resolved against the current state of the base branch.');
  lines.push('Do NOT duplicate work that already exists in the base branch from recently merged PRs.');

  return lines.join('\n');
}

/**
 * Adds a comment to each original PR explaining the batch resolution.
 * Non-fatal — does not throw on failure.
 */
async function commentOnPRs(
  octokit: Octokit,
  owner: string,
  repo: string,
  prs: PR[],
  sessionId: string,
): Promise<void> {
  const prList = prs.map((p) => `#${p.number}`).join(', ');
  const sessionLink = `https://jules.google.com/sessions/${sessionId}`;
  const body = [
    '🔄 **Batch conflict resolution in progress**',
    '',
    `This PR is part of a batch being resolved together: ${prList}`,
    `A Jules session has been dispatched to create a combined PR that resolves all conflicts.`,
    '',
    `**Session:** [${sessionId}](${sessionLink})`,
  ].join('\n');

  await Promise.all(
    prs.map(async (pr) => {
      try {
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pr.number,
          body,
        });
      } catch {
        // Non-fatal — comment failure shouldn't block the resolution
      }
    }),
  );
}
