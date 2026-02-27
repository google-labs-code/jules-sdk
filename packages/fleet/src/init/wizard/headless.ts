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

import { fail } from '../../shared/result/index.js';
import { getGitRepoInfo } from '../../shared/auth/git.js';
import type { FleetEmitter } from '../../shared/events.js';
import { WORKFLOW_TEMPLATES } from '../templates.js';
import type { InitArgs, InitWizardResult } from './types.js';

/**
 * Validate all required inputs from flags + env vars in non-interactive mode.
 * Fails with actionable errors when required values are missing.
 */
export async function validateHeadlessInputs(
  args: InitArgs,
  emit: FleetEmitter,
): Promise<InitWizardResult | ReturnType<typeof fail>> {
  // ── Repository ──
  let repoSlug = args.repo ?? process.env.GITHUB_REPOSITORY;
  if (!repoSlug) {
    try {
      const info = await getGitRepoInfo();
      repoSlug = info.fullName;
    } catch {
      return fail(
        'UNKNOWN_ERROR',
        'Missing repository. Set --repo, GITHUB_REPOSITORY env var, or run from a git repo.',
        true,
      );
    }
  }
  const [owner, repo] = repoSlug.split('/');
  if (!owner || !repo) {
    return fail('UNKNOWN_ERROR', `Invalid repo format: "${repoSlug}". Expected owner/repo.`, false);
  }

  // ── Authentication ──
  const hasToken = !!process.env.GITHUB_TOKEN;
  const hasApp = !!(
    (args['app-id'] || process.env.GITHUB_APP_ID) &&
    (process.env.GITHUB_APP_PRIVATE_KEY_BASE64 || process.env.GITHUB_APP_PRIVATE_KEY) &&
    (args['installation-id'] || process.env.GITHUB_APP_INSTALLATION_ID)
  );

  let authMethod: 'token' | 'app';

  if (args.auth === 'app' || (!args.auth && hasApp)) {
    authMethod = 'app';
    if (args['app-id']) process.env.GITHUB_APP_ID = args['app-id'];
    if (args['installation-id']) process.env.GITHUB_APP_INSTALLATION_ID = args['installation-id'];
    if (!hasApp) {
      const missing: string[] = [];
      if (!process.env.GITHUB_APP_ID && !args['app-id']) missing.push('GITHUB_APP_ID (env) or --app-id');
      if (!process.env.GITHUB_APP_PRIVATE_KEY_BASE64 && !process.env.GITHUB_APP_PRIVATE_KEY) {
        missing.push('GITHUB_APP_PRIVATE_KEY_BASE64 (env)');
      }
      if (!process.env.GITHUB_APP_INSTALLATION_ID && !args['installation-id']) {
        missing.push('GITHUB_APP_INSTALLATION_ID (env) or --installation-id');
      }
      return fail(
        'UNKNOWN_ERROR',
        `Missing GitHub App credentials: ${missing.join(', ')}.\nOr run without --non-interactive for guided setup.`,
        true,
      );
    }
  } else if (args.auth === 'token' || (!args.auth && hasToken)) {
    authMethod = 'token';
  } else {
    return fail(
      'UNKNOWN_ERROR',
      'Missing GitHub authentication.\nSet GITHUB_TOKEN or GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY_BASE64 + GITHUB_APP_INSTALLATION_ID.\nOr run without --non-interactive for guided setup.',
      true,
    );
  }

  emit({ type: 'init:auth:detected', method: authMethod });

  // ── Jules API Key ──
  if (!process.env.JULES_API_KEY) {
    emit({
      type: 'init:secret:skipped',
      name: 'JULES_API_KEY',
      reason: 'Not set — Fleet workflows will not be able to dispatch sessions.',
    });
  }

  const baseBranch = args.base ?? 'main';
  const dryRun = args['dry-run'] ?? false;

  // In non-interactive mode, never upload secrets by default
  const secretsToUpload: Record<string, string> = {};

  // ── Dry run ──
  if (dryRun) {
    const files = WORKFLOW_TEMPLATES.map((t) => t.repoPath);
    files.push('.fleet/goals/example.md');
    emit({ type: 'init:dry-run', files });
  }

  return { owner, repo, baseBranch, authMethod, secretsToUpload, dryRun, overwrite: false };
}
