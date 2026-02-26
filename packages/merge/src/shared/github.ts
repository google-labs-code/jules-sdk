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
import { createAppAuth } from '@octokit/auth-app';

/**
 * Create an authenticated Octokit instance.
 *
 * Auth priority (matches @google/jules-fleet):
 * 1. GitHub App (GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY[_BASE64] + GITHUB_APP_INSTALLATION_ID)
 * 2. PAT fallback (GITHUB_TOKEN or GH_TOKEN)
 */
export function createOctokit(): Octokit {
  const appId = process.env.GITHUB_APP_ID;
  const privateKeyBase64 = process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
  const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (appId && (privateKeyBase64 || privateKeyRaw) && installationId) {
    const privateKey = privateKeyBase64
      ? Buffer.from(privateKeyBase64, 'base64').toString('utf-8')
      : privateKeyRaw!;
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey,
        installationId: Number(installationId),
      },
    });
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    return new Octokit({ auth: token });
  }

  throw new Error(
    'GitHub auth not configured. Set GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_INSTALLATION_ID for App auth, or GITHUB_TOKEN for PAT auth.',
  );
}

/**
 * Compare two commits and return the list of changed file paths.
 */
export async function compareCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  base: string,
  head: string,
): Promise<string[]> {
  const { data } = await octokit.repos.compareCommits({
    owner,
    repo,
    base,
    head,
  });
  return (data.files ?? []).map((f) => f.filename);
}

/**
 * Get the content of a file from a specific ref.
 * Returns empty string if file is not found (404).
 */
export async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ('content' in data && typeof data.content === 'string') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }

    return '';
  } catch (error: any) {
    if (error?.status === 404) {
      return '';
    }
    throw error;
  }
}
