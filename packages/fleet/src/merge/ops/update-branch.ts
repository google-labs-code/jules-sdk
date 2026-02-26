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
 * Updates a PR branch from its base branch.
 * Returns conflict status so the caller can decide to re-dispatch.
 */
export async function updateBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  emit: FleetEmitter,
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
      emit({ type: 'merge:conflict:detected', prNumber });
      return { ok: false, conflict: true };
    }
    const message =
      error instanceof Error ? error.message : String(error);
    return { ok: false, conflict: false, error: message };
  }
}
