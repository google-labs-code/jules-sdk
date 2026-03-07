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
import type { InitInput, InitResult } from '../spec.js';
import type { FleetEmitter } from '../../shared/events.js';
import { createRepo, isRepoResult } from './create-repo.js';

/**
 * Ensure the target repository exists.
 *
 * - If `input.createRepo` is false, returns `undefined` (no-op).
 * - If the repo already exists, emits `init:repo:exists` and returns `undefined`.
 * - If the repo doesn't exist, creates it and returns `true`.
 * - On failure, returns a fail `InitResult`.
 */
export async function ensureRepo(
  octokit: Octokit,
  input: InitInput,
  emit: FleetEmitter,
): Promise<true | undefined | InitResult> {
  if (!input.createRepo) return undefined;

  const { owner, repoName: repo } = input;

  // Check if repo already exists
  let repoExists = true;
  try {
    await octokit.rest.repos.get({ owner, repo });
  } catch (error: any) {
    if (error?.status === 404) {
      repoExists = false;
    } else {
      throw error;
    }
  }

  if (repoExists) {
    emit({ type: 'init:repo:exists', fullName: `${owner}/${repo}` });
    return undefined;
  }

  const repoResult = await createRepo(
    octokit, owner, repo,
    { visibility: input.visibility ?? 'private', description: input.description },
    emit,
  );
  if (isRepoResult(repoResult)) return repoResult;
  return true;
}
