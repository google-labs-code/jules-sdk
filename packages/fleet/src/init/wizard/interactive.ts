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

import * as p from '@clack/prompts';
import { fail } from '../../shared/result/index.js';
import { getGitRepoInfo } from '../../shared/auth/git.js';
import type { FleetEmitter } from '../../shared/events.js';
import { WORKFLOW_TEMPLATES } from '../templates.js';
import type { InitArgs, InitWizardResult } from './types.js';

/**
 * Collect all init inputs via interactive wizard prompts.
 * Each step checks if the value is already available from flags/env
 * and skips the prompt if so.
 */
export async function runInitWizard(
  args: InitArgs,
  emit: FleetEmitter,
): Promise<InitWizardResult | ReturnType<typeof fail>> {
  // ── Step 1: Repository ──
  let repoSlug: string | undefined = args.repo ?? process.env.GITHUB_REPOSITORY;
  if (!repoSlug) {
    try {
      const info = await getGitRepoInfo();
      repoSlug = info.fullName;
    } catch {
      // Could not auto-detect
    }
  }

  if (repoSlug) {
    const confirmed = await p.confirm({
      message: `Detected repository: ${repoSlug}. Is this correct?`,
      initialValue: true,
    });
    if (p.isCancel(confirmed)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
    if (!confirmed) {
      const manual = await p.text({
        message: 'Enter repository in owner/repo format:',
        validate: (v) => !v || !/^[^/]+\/[^/]+$/.test(v) ? 'Must be owner/repo format' : undefined,
      });
      if (p.isCancel(manual)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
      repoSlug = manual;
    }
  } else {
    const manual = await p.text({
      message: 'Enter repository in owner/repo format:',
      validate: (v) => !v || !/^[^/]+\/[^/]+$/.test(v) ? 'Must be owner/repo format' : undefined,
    });
    if (p.isCancel(manual)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
    repoSlug = manual;
  }

  const [owner, repo] = repoSlug.split('/');

  // ── Step 2: Base branch ──
  const baseBranch = args.base ?? 'main';

  // ── Step 3: Authentication ──
  const hasToken = !!process.env.GITHUB_TOKEN;
  const hasApp = !!(process.env.GITHUB_APP_ID && (process.env.GITHUB_APP_PRIVATE_KEY_BASE64 || process.env.GITHUB_APP_PRIVATE_KEY) && process.env.GITHUB_APP_INSTALLATION_ID);

  let authMethod: 'token' | 'app';

  if (args.auth === 'token' || args.auth === 'app') {
    authMethod = args.auth;
  } else if (hasApp) {
    authMethod = 'app';
    p.log.success('GitHub App credentials detected');
  } else if (hasToken) {
    authMethod = 'token';
    p.log.success('GITHUB_TOKEN detected');
  } else {
    const authChoice = await p.select({
      message: 'How will Fleet authenticate with GitHub?',
      options: [
        { value: 'token' as const, label: 'Personal Access Token (GITHUB_TOKEN)' },
        { value: 'app' as const, label: 'GitHub App (recommended for orgs)' },
      ],
    });
    if (p.isCancel(authChoice)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
    authMethod = authChoice;

    // Prompt for credentials
    if (authMethod === 'token') {
      if (!hasToken) {
        const token = await p.password({
          message: 'Paste your GitHub token:',
        });
        if (p.isCancel(token)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
        process.env.GITHUB_TOKEN = token;
      }
    } else {
      if (!process.env.GITHUB_APP_ID) {
        const appId = await p.text({ message: 'Enter your GitHub App ID:' });
        if (p.isCancel(appId)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
        process.env.GITHUB_APP_ID = appId;
      }
      if (!process.env.GITHUB_APP_INSTALLATION_ID) {
        const installId = await p.text({ message: 'Enter your Installation ID:' });
        if (p.isCancel(installId)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
        process.env.GITHUB_APP_INSTALLATION_ID = installId;
      }
      if (!process.env.GITHUB_APP_PRIVATE_KEY_BASE64 && !process.env.GITHUB_APP_PRIVATE_KEY) {
        const key = await p.password({ message: 'Paste your private key (base64 encoded):' });
        if (p.isCancel(key)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
        process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = key;
      }
    }
  }

  emit({ type: 'init:auth:detected', method: authMethod });

  // ── Step 4: Jules API Key ──
  const secretsToUpload: Record<string, string> = {};
  const julesKey = process.env.JULES_API_KEY;

  if (!julesKey) {
    const wantKey = await p.confirm({
      message: 'Fleet needs a JULES_API_KEY to dispatch sessions. Do you have one?',
      initialValue: true,
    });
    if (!p.isCancel(wantKey) && wantKey) {
      const key = await p.password({ message: 'Enter your Jules API key:' });
      if (!p.isCancel(key)) {
        process.env.JULES_API_KEY = key;
        secretsToUpload['JULES_API_KEY'] = key;
      }
    }
  } else {
    p.log.success('JULES_API_KEY detected');
    secretsToUpload['JULES_API_KEY'] = julesKey;
  }

  // ── Step 5: Upload secrets? ──
  const shouldUpload = args['upload-secrets'] ?? true;
  if (shouldUpload && Object.keys(secretsToUpload).length > 0) {
    const confirmed = await p.confirm({
      message: `Upload ${Object.keys(secretsToUpload).length} secret(s) to GitHub Actions secrets?`,
      initialValue: true,
    });
    if (p.isCancel(confirmed) || !confirmed) {
      Object.keys(secretsToUpload).forEach((k) => delete secretsToUpload[k]);
    }
  }

  // Also offer to upload app credentials if using app auth
  if (shouldUpload && authMethod === 'app') {
    const uploadApp = await p.confirm({
      message: 'Upload GitHub App credentials to repo secrets?',
      initialValue: true,
    });
    if (!p.isCancel(uploadApp) && uploadApp) {
      if (process.env.GITHUB_APP_ID) secretsToUpload['GITHUB_APP_ID'] = process.env.GITHUB_APP_ID;
      if (process.env.GITHUB_APP_PRIVATE_KEY_BASE64) {
        secretsToUpload['GITHUB_APP_PRIVATE_KEY_BASE64'] = process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
      }
      if (process.env.GITHUB_APP_INSTALLATION_ID) {
        secretsToUpload['GITHUB_APP_INSTALLATION_ID'] = process.env.GITHUB_APP_INSTALLATION_ID;
      }
    }
  }

  // ── Step 6: Dry run? ──
  const dryRun = args['dry-run'] ?? false;

  // ── Step 7: Confirmation ──
  if (!dryRun) {
    const files = WORKFLOW_TEMPLATES.map((t) => t.repoPath);
    files.push('.fleet/goals/example.md');

    p.log.info([
      'Fleet will:',
      `  • Create a branch from ${baseBranch}`,
      `  • Commit ${files.length} files`,
      '  • Open a pull request',
      '  • Configure labels (fleet, fleet-merge-ready)',
    ].join('\n'));

    const proceed = await p.confirm({
      message: 'Create the PR now?',
      initialValue: true,
    });
    if (p.isCancel(proceed)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
    if (!proceed) {
      emit({ type: 'init:dry-run', files });
      return fail(
        'UNKNOWN_ERROR',
        `Dry run: would create ${files.length} files. Run again to proceed.`,
        false,
      );
    }
  }

  return { owner, repo, baseBranch, authMethod, secretsToUpload, dryRun };
}
