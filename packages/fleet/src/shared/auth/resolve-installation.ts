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

import { Octokit } from 'octokit';
import { createAppAuth } from '@octokit/auth-app';

/** Result of resolving a GitHub App installation for a target repo. */
export interface ResolvedInstallation {
  installationId: number;
  accountLogin: string;
  accountType: string;
  appId: number;
  appName: string;
  appSlug: string;
}

/**
 * Auto-detect the GitHub App installation that covers a target repository.
 *
 * Authenticates as the GitHub App using JWT, lists all installations,
 * and checks which one has access to the specified owner/repo.
 *
 * @param appId - GitHub App ID
 * @param privateKey - PEM-formatted private key string
 * @param targetOwner - Repository owner to look for
 * @param targetRepo - Repository name to look for
 */
export async function resolveInstallation(
  appId: string,
  privateKey: string,
  targetOwner: string,
  targetRepo: string,
): Promise<ResolvedInstallation> {
  // Authenticate as the GitHub App (JWT — not as an installation)
  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey },
  });

  // Get app info (name, slug)
  const { data: app } = await appOctokit.rest.apps.getAuthenticated();
  if (!app) {
    throw new Error('Could not authenticate as GitHub App. Check your App ID and private key.');
  }
  const appName = app.name ?? 'Unknown App';
  const appSlug = app.slug ?? appId;

  // List all installations
  const { data: installations } =
    await appOctokit.rest.apps.listInstallations();

  if (installations.length === 0) {
    throw new Error(
      `No installations found for app "${appName}". Install it at https://github.com/apps/${appSlug}/installations`,
    );
  }

  // Find the installation that has access to the target repo
  const targetFullName = `${targetOwner}/${targetRepo}`.toLowerCase();
  const matches: ResolvedInstallation[] = [];

  for (const installation of installations) {
    try {
      // Authenticate as this specific installation to list its repos
      const installOctokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId,
          privateKey,
          installationId: installation.id,
        },
      });

      const { data: repos } =
        await installOctokit.rest.apps.listReposAccessibleToInstallation({
          per_page: 100,
        });

      const hasAccess = repos.repositories.some(
        (r) => r.full_name.toLowerCase() === targetFullName,
      );

      if (hasAccess) {
        matches.push({
          installationId: installation.id,
          accountLogin: installation.account?.login ?? 'unknown',
          accountType: installation.account?.type ?? 'unknown',
          appId: Number(appId),
          appName,
          appSlug,
        });
      }
    } catch {
      // Skip installations we can't access
      continue;
    }
  }

  if (matches.length === 0) {
    const accountNames = installations
      .map((i) => i.account?.login)
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `App "${appName}" is not installed on ${targetOwner}/${targetRepo}.\n` +
      `Current installations: ${accountNames}\n` +
      `Install at: https://github.com/apps/${appSlug}/installations`,
    );
  }

  if (matches.length === 1) {
    return matches[0];
  }

  // Multiple matches — caller should handle selection
  // Shouldn't normally happen (a repo can only be in one installation per app)
  return matches[0];
}
