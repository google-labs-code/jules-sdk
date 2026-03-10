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
import { cachePlugin } from './cache-plugin.js';
import { resolvePrivateKey } from './resolve-key.js';

/** Octokit with built-in ETag caching */
const CachedOctokit = Octokit.plugin(cachePlugin) as typeof Octokit;

/**
 * Canonical env var name for the private key.
 * Legacy alternatives (FLEET_APP_PRIVATE_KEY, GITHUB_APP_PRIVATE_KEY_BASE64)
 * are accepted with a deprecation warning.
 */
const CANONICAL_KEY_NAME = 'FLEET_APP_PRIVATE_KEY_BASE64';

/** Private key env var candidates, in priority order. */
const KEY_CANDIDATES = [
  { name: 'FLEET_APP_PRIVATE_KEY_BASE64', canonical: true },
  { name: 'FLEET_APP_PRIVATE_KEY', canonical: false },
  { name: 'GITHUB_APP_PRIVATE_KEY_BASE64', canonical: false },
  { name: 'GITHUB_APP_PRIVATE_KEY', canonical: false },
] as const;

/**
 * Detect auth mode from environment variables and return Octokit options.
 *
 * Auth resolution protocol:
 *
 * 1. App auth — requires all three:
 *    - FLEET_APP_ID (or GITHUB_APP_ID)
 *    - FLEET_APP_INSTALLATION_ID (or GITHUB_APP_INSTALLATION_ID)
 *    - Private key (first found from KEY_CANDIDATES)
 *    If partial (ID set but key missing) → throw a clear error.
 *
 * 2. Token auth — GITHUB_TOKEN or GH_TOKEN
 *
 * 3. No auth → throw listing all checked env vars.
 */
export function getAuthOptions(): ConstructorParameters<typeof Octokit>[0] {
  const appId = process.env.FLEET_APP_ID || process.env.GITHUB_APP_ID;
  const installationId = process.env.FLEET_APP_INSTALLATION_ID || process.env.GITHUB_APP_INSTALLATION_ID;

  // Find the first available private key
  let privateKeyValue: string | undefined;
  let privateKeySource: string | undefined;
  for (const candidate of KEY_CANDIDATES) {
    const val = process.env[candidate.name];
    if (val) {
      privateKeyValue = val;
      privateKeySource = candidate.name;
      if (!candidate.canonical) {
        console.warn(
          `⚠ Using legacy env var ${candidate.name} — prefer ${CANONICAL_KEY_NAME}`,
        );
      }
      break;
    }
  }

  // Partial App config detection
  const hasAppId = Boolean(appId);
  const hasInstallId = Boolean(installationId);
  const hasKey = Boolean(privateKeyValue);

  if (hasAppId || hasInstallId) {
    // At least one App var is set — require all three
    if (!hasKey) {
      const checkedNames = KEY_CANDIDATES.map((c) => c.name).join(', ');
      throw new Error(
        `App auth partially configured: ${hasAppId ? 'FLEET_APP_ID' : 'FLEET_APP_INSTALLATION_ID'} is set but no private key found.\n` +
        `Checked: ${checkedNames}\n` +
        `Either set all App auth vars or remove FLEET_APP_ID to use token auth.`,
      );
    }
    if (!hasAppId || !hasInstallId) {
      throw new Error(
        `App auth partially configured: missing ${!hasAppId ? 'FLEET_APP_ID' : 'FLEET_APP_INSTALLATION_ID'}.\n` +
        `Set all three: FLEET_APP_ID, ${CANONICAL_KEY_NAME}, FLEET_APP_INSTALLATION_ID.`,
      );
    }

    return {
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey: resolvePrivateKey(privateKeyValue, undefined),
        installationId: Number(installationId),
      },
    };
  }

  // Token auth fallback
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    return { auth: token };
  }

  throw new Error(
    'GitHub auth not configured. Set FLEET_APP_ID + FLEET_APP_PRIVATE_KEY_BASE64 + FLEET_APP_INSTALLATION_ID for App auth, or GITHUB_TOKEN for token auth.',
  );
}

/** Create a new authenticated Octokit instance with caching. */
export function createFleetOctokit(): InstanceType<typeof Octokit> {
  return new CachedOctokit(getAuthOptions());
}
