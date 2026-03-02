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

import { execSync } from 'node:child_process';
import { Octokit } from 'octokit';
import { createAppAuth } from '@octokit/auth-app';
import { resolvePrivateKey } from '../../shared/auth/resolve-key.js';
import type {
  AuthDetectSpec,
  AuthDetectInput,
  AuthDetectResult,
  DetectedCredential,
} from './spec.js';

/**
 * AuthDetectHandler discovers credentials from env vars and gh CLI,
 * validates them against the target repo, and respects --auth intent.
 *
 * Never throws — all errors are Result values.
 */
export class AuthDetectHandler implements AuthDetectSpec {
  async execute(input: AuthDetectInput): Promise<AuthDetectResult> {
    try {
      const { owner, repo, preferredMethod } = input;
      const detected: DetectedCredential[] = [];

      // ── 1. Detect available credentials, gated by preferredMethod ──

      const hasToken = !!process.env.GITHUB_TOKEN;
      const hasApp = this.hasAppCredentials();

      // Only check sources matching the user's intent
      if (preferredMethod !== 'token' && hasApp) {
        detected.push({ method: 'app', source: 'env' });
      }
      if (preferredMethod !== 'app' && hasToken) {
        detected.push({ method: 'token', source: 'env' });
      }

      // Fallback: try gh CLI for token auth (only if token not already found)
      if (preferredMethod !== 'app' && !hasToken) {
        const ghToken = this.tryGhCliToken();
        if (ghToken) {
          process.env.GITHUB_TOKEN = ghToken;
          detected.push({ method: 'token', source: 'gh-cli' });
        }
      }

      // ── 2. No credentials found ──
      if (detected.length === 0) {
        const methodHint = preferredMethod
          ? `for ${preferredMethod} auth`
          : '';
        return {
          success: false,
          error: {
            code: 'NO_CREDENTIALS_FOUND',
            message: `No credentials found ${methodHint}`.trim() + '.',
            suggestion: preferredMethod === 'app'
              ? 'Set FLEET_APP_ID + FLEET_APP_PRIVATE_KEY + FLEET_APP_INSTALLATION_ID in your environment.'
              : preferredMethod === 'token'
                ? 'Set GITHUB_TOKEN or install GitHub CLI (gh auth login).'
                : 'Set GITHUB_TOKEN, install GitHub CLI (gh auth login), or set FLEET_APP_* vars for app auth.',
            recoverable: true,
          },
        };
      }

      // ── 3. Pick the credential to health-check ──
      // If user has a preference, use that. Otherwise pick the first detected.
      let active: DetectedCredential;
      if (preferredMethod) {
        const match = detected.find(d => d.method === preferredMethod);
        active = match ?? detected[0];
      } else {
        active = detected[0];
      }

      // ── 4. Health check against target repo ──
      const healthResult = await this.healthCheck(active.method, owner, repo);
      if (!healthResult.ok) {
        return healthResult.result;
      }
      const { identity } = healthResult;

      // ── 5. Return success with alternatives for wizard ──
      const alternatives = detected.length > 1 && !preferredMethod
        ? detected
        : undefined;

      return {
        success: true,
        data: {
          method: active.method,
          source: active.source,
          identity,
          alternatives,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
        },
      };
    }
  }

  // ── Private helpers ──

  private hasAppCredentials(): boolean {
    const appId = process.env.FLEET_APP_ID || process.env.GITHUB_APP_ID;
    const privateKey = process.env.FLEET_APP_PRIVATE_KEY
      || process.env.FLEET_APP_PRIVATE_KEY_BASE64
      || process.env.GITHUB_APP_PRIVATE_KEY_BASE64
      || process.env.GITHUB_APP_PRIVATE_KEY;
    const installationId = process.env.FLEET_APP_INSTALLATION_ID || process.env.GITHUB_APP_INSTALLATION_ID;
    return !!(appId && privateKey && installationId);
  }

  /**
   * Try to get a GitHub token from the gh CLI credential store.
   * Returns null if gh is not installed or no token is available.
   */
  private tryGhCliToken(): string | null {
    try {
      const result = execSync('gh auth token 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      return result || null;
    } catch {
      return null;
    }
  }

  /**
   * Verify credentials work against the target repo.
   * Returns identity on success, structured error on failure.
   */
  private async healthCheck(
    method: 'token' | 'app',
    owner: string,
    repo: string,
  ): Promise<{ ok: true; identity: string } | { ok: false; result: AuthDetectResult }> {
    try {
      const octokit = method === 'app'
        ? this.createAppOctokit()
        : new Octokit({ auth: process.env.GITHUB_TOKEN });

      // Check repo access — this validates both auth AND permissions
      const { data: repoData } = await octokit.rest.repos.get({ owner, repo });

      // Get identity
      let identity: string;
      if (method === 'token') {
        const { data: user } = await octokit.rest.users.getAuthenticated();
        identity = user.login;
      } else {
        identity = `app with access to ${repoData.full_name}`;
      }

      return { ok: true, identity };
    } catch (error: any) {
      const status = error?.status;
      const message = error instanceof Error ? error.message : String(error);

      let suggestion: string;
      if (status === 401) {
        suggestion = method === 'token'
          ? 'Token is invalid or expired. Run `gh auth login` or set a new GITHUB_TOKEN.'
          : 'App credentials are invalid. Check FLEET_APP_ID, FLEET_APP_PRIVATE_KEY, and FLEET_APP_INSTALLATION_ID.';
      } else if (status === 403) {
        suggestion = 'Token lacks required permissions. Ensure the token has `repo` scope.';
      } else if (status === 404) {
        suggestion = `Repository ${owner}/${repo} not found, or token lacks access. Check repo name and token scopes.`;
      } else {
        suggestion = `Unexpected error (HTTP ${status ?? 'unknown'}): ${message}`;
      }

      return {
        ok: false,
        result: {
          success: false,
          error: {
            code: 'HEALTH_CHECK_FAILED',
            message: `Auth health check failed for ${method} auth: ${message}`,
            suggestion,
            recoverable: true,
            details: {
              httpStatus: status,
              repoAccess: false,
            },
          },
        },
      };
    }
  }

  private createAppOctokit(): Octokit {
    const appId = process.env.FLEET_APP_ID || process.env.GITHUB_APP_ID;
    const privateKeyBase64 = process.env.FLEET_APP_PRIVATE_KEY
      || process.env.FLEET_APP_PRIVATE_KEY_BASE64
      || process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
    const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY;
    const installationId = process.env.FLEET_APP_INSTALLATION_ID || process.env.GITHUB_APP_INSTALLATION_ID;

    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey: resolvePrivateKey(privateKeyBase64, privateKeyRaw),
        installationId: Number(installationId),
      },
    });
  }
}
