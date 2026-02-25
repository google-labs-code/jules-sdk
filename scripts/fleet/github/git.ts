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

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitRepoInfo {
  owner: string;
  repo: string;
  /** Full GitHub path in "owner/repo" format */
  fullName: string;
}

/**
 * Parses the current git repository's remote URL to extract owner and repo.
 * Supports both HTTPS and SSH remote URL formats.
 *
 * @param remoteName - The name of the remote to parse (default: "origin")
 * @returns The parsed repository information
 * @throws Error if not in a git repository or remote URL cannot be parsed
 *
 * @example
 * const repo = await getGitRepoInfo();
 * console.log(repo.fullName); // "owner/repo"
 */
export async function getGitRepoInfo(
  remoteName = 'origin',
): Promise<GitRepoInfo> {
  const { stdout } = await execAsync(`git remote get-url ${remoteName}`);
  const remoteUrl = stdout.trim();

  return parseGitRemoteUrl(remoteUrl);
}

/**
 * Parses a git remote URL to extract owner and repo.
 * Supports both HTTPS and SSH URL formats:
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 *
 * @param remoteUrl - The git remote URL to parse
 * @returns The parsed repository information
 * @throws Error if the URL format is not recognized
 */
export function parseGitRemoteUrl(remoteUrl: string): GitRepoInfo {
  // SSH format: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/(.+?)(\.git)?$/);
  if (sshMatch) {
    const [, owner, repo] = sshMatch;
    return {
      owner,
      repo: repo.replace(/\.git$/, ''),
      fullName: `${owner}/${repo.replace(/\.git$/, '')}`,
    };
  }

  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(
    /https?:\/\/github\.com\/([^/]+)\/(.+?)(\.git)?$/,
  );
  if (httpsMatch) {
    const [, owner, repo] = httpsMatch;
    return {
      owner,
      repo: repo.replace(/\.git$/, ''),
      fullName: `${owner}/${repo.replace(/\.git$/, '')}`,
    };
  }

  throw new Error(`Unable to parse git remote URL: ${remoteUrl}`);
}

/**
 * Gets the current git branch name.
 *
 * @returns The current branch name
 * @throws Error if not in a git repository
 */
export async function getCurrentBranch(): Promise<string> {
  const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD');
  return stdout.trim();
}
