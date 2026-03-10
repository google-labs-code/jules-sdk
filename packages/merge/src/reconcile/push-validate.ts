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

import { Octokit } from '@octokit/rest';
import { PushInputSchema } from './schemas.js';
import { readManifest } from './manifest.js';
import { validateBranchName } from '../shared/validators.js';
import { ConflictError, HardError } from '../shared/errors.js';
import * as github from '../shared/github.js';
import type { PushContext } from './push-types.js';

export async function validatePushInput(
  octokit: Octokit,
  rawInput: any,
): Promise<PushContext> {
  const input = PushInputSchema.parse(rawInput);
  validateBranchName(input.branch);

  const [owner, repo] = input.repo.split('/');
  if (!owner || !repo) {
    throw new HardError('Repo must be in owner/repo format');
  }

  const manifest = readManifest();
  if (!manifest) {
    throw new HardError(
      'No active reconciliation manifest found. Run scan first.',
    );
  }

  if (manifest.pending.length > 0) {
    throw new ConflictError(
      `Cannot push: ${manifest.pending.length} file(s) still pending resolution.`,
    );
  }

  const warnings: string[] = [];

  // Check base SHA freshness
  const currentBase = await github.getBranch(
    octokit,
    owner,
    repo,
    manifest.base.branch,
  );
  if (currentBase.commit.sha !== manifest.base.sha) {
    warnings.push('BASE_SHA_MISMATCH');
  }

  const baseSha = manifest.base.sha;
  const baseTreeSha = currentBase.commit.commit.tree.sha;

  // Verify merge strategy compatibility
  const repoInfo = await github.getRepo(octokit, owner, repo);
  if (
    !(repoInfo as any).allow_merge_commit &&
    (repoInfo as any).allow_squash_merge
  ) {
    throw new HardError(
      'Repository only allows squash merges. Jules Merge requires merge commits to preserve ancestry chain.',
    );
  }

  return {
    octokit,
    input,
    owner,
    repo,
    manifest,
    baseBranchName: manifest.base.branch,
    baseSha,
    baseTreeSha,
    warnings,
  };
}
