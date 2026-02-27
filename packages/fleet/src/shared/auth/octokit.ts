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
 * Detect auth mode from environment variables and return Octokit options.
 *
 * Priority:
 * 1. GitHub App (FLEET_APP_* or GITHUB_APP_* env vars)
 * 2. PAT fallback (GITHUB_TOKEN)
 *
 * FLEET_APP_* and GITHUB_APP_* are interchangeable — same names used
 * in .env files, CI secrets, and workflow templates.
 */
export function getAuthOptions(): ConstructorParameters<typeof Octokit>[0] {
  const appId = process.env.FLEET_APP_ID || process.env.GITHUB_APP_ID;
  const privateKeyBase64 = process.env.FLEET_APP_PRIVATE_KEY || process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
  const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.FLEET_APP_INSTALLATION_ID || process.env.GITHUB_APP_INSTALLATION_ID;

  if (appId && (privateKeyBase64 || privateKeyRaw) && installationId) {
    return {
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey: resolvePrivateKey(privateKeyBase64, privateKeyRaw),
        installationId: Number(installationId),
      },
    };
  }

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    return { auth: token };
  }

  throw new Error(
    'GitHub auth not configured. Set FLEET_APP_ID + FLEET_APP_PRIVATE_KEY + FLEET_APP_INSTALLATION_ID for App auth, or GITHUB_TOKEN for PAT auth.',
  );
}

/** Create a new authenticated Octokit instance with caching. */
export function createFleetOctokit(): InstanceType<typeof Octokit> {
  return new CachedOctokit(getAuthOptions());
}
