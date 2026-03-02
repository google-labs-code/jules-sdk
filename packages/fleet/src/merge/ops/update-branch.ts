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

/** Max polls waiting for GitHub to compute mergeable state */
const MERGEABLE_POLL_LIMIT = 5;
const MERGEABLE_POLL_INTERVAL_MS = 2_000;

/**
 * Updates a PR branch from its base branch.
 * Returns conflict status so the caller can decide to re-dispatch.
 */
export async function updateBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  emit: FleetEmitter,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ ok: boolean; conflict: boolean; error?: string }> {
  try {
    emit({ type: 'merge:branch:updating', prNumber });
    await octokit.rest.pulls.updateBranch({
      owner,
      repo,
      pull_number: prNumber,
    });
    emit({ type: 'merge:branch:updated', prNumber });
    return { ok: true, conflict: false };
  } catch (error: unknown) {
    const status =
      error && typeof error === 'object' && 'status' in error
        ? (error as { status: number }).status
        : 0;
    if (status === 422) {
      // 422 is ambiguous — could be "already up to date" or a real conflict.
      // Use `pulls.get().mergeable` as the definitive signal.
      const conflict = await isMergeConflict(octokit, owner, repo, prNumber, sleep);
      if (conflict) {
        emit({ type: 'merge:conflict:detected', prNumber });
        return { ok: false, conflict: true };
      }
      // Not a conflict (e.g., already up to date) — treat as success.
      emit({ type: 'merge:branch:updated', prNumber });
      return { ok: true, conflict: false };
    }
    const message =
      error instanceof Error ? error.message : String(error);
    return { ok: false, conflict: false, error: message };
  }
}

/**
 * Checks whether a PR has a merge conflict using GitHub's `mergeable` field.
 * Polls if `mergeable` is null (GitHub is still computing).
 */
async function isMergeConflict(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  sleep: (ms: number) => Promise<void>,
): Promise<boolean> {
  for (let i = 0; i < MERGEABLE_POLL_LIMIT; i++) {
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });
    if (pr.mergeable === true) return false;
    if (pr.mergeable === false) return true;
    // null = still computing, wait and retry
    await sleep(MERGEABLE_POLL_INTERVAL_MS);
  }
  // If still null after polling, assume not a conflict to avoid false positives.
  return false;
}

