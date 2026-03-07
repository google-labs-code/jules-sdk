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
import { execSync } from 'node:child_process';

/**
 * Context object passed to `commitFiles` and `createInitPR`.
 */
export interface CommitContext {
  octokit: Octokit;
  owner: string;
  repo: string;
  branchName: string;
  emit: FleetEmitter;
  coAuthor?: string;
}

/**
 * Read the local git author from `git config`.
 * Returns "Name <email>" for Co-authored-by trailers, or undefined on failure.
 */
export function getLocalGitAuthor(): string | undefined {
  try {
    const name = execSync('git config user.name', { encoding: 'utf-8' }).trim();
    const email = execSync('git config user.email', { encoding: 'utf-8' }).trim();
    if (name && email) return `${name} <${email}>`;
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build the commit context used by `commitFiles` and `createInitPR`.
 *
 * For App auth, queries local git config for co-author attribution.
 * For PAT auth, no co-author is needed (commits are already user-attributed).
 */
export function buildCommitContext(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string,
  emit: FleetEmitter,
): CommitContext {
  const isAppAuth = !!(process.env.FLEET_APP_ID || process.env.GITHUB_APP_ID);
  return {
    octokit,
    owner,
    repo,
    branchName,
    emit,
    coAuthor: isAppAuth ? getLocalGitAuthor() : undefined,
  };
}
