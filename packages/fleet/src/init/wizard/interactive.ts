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
import { createFleetOctokit } from '../../shared/auth/octokit.js';
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
      // ── GitHub App: slug → key file → auto-detect ──
      const { resolvePrivateKeyFromInput } = await import('../../shared/auth/resolve-key-input.js');
      const { resolveInstallation } = await import('../../shared/auth/resolve-installation.js');

      // 1. App slug
      const slug = await p.text({
        message: 'What is your GitHub App slug? (from the URL: github.com/settings/apps/<slug>)',
        validate: (v) => !v?.trim() ? 'App slug is required' : undefined,
      });
      if (p.isCancel(slug)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);

      p.log.info(`Download your private key from: https://github.com/settings/apps/${slug}`);

      // 2. Private key (file path, PEM, or base64)
      const keyInput = await p.text({
        message: 'Path to your private key (.pem file), or paste the key directly:',
        validate: (v) => !v?.trim() ? 'Private key is required' : undefined,
      });
      if (p.isCancel(keyInput)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);

      let privateKeyPem: string;
      try {
        privateKeyPem = resolvePrivateKeyFromInput(keyInput);
      } catch (err) {
        return fail(
          'UNKNOWN_ERROR',
          err instanceof Error ? err.message : 'Could not parse private key.',
          true,
        );
      }

      // 3. Auto-detect App ID and Installation ID
      const s = p.spinner();
      s.start(`Authenticating as "${slug}" and finding installation for ${owner}/${repo}...`);

      try {
        // We need the app ID — get it from the API using the slug
        // First, authenticate as the app to discover its ID
        const { Octokit } = await import('octokit');
        const { createAppAuth } = await import('@octokit/auth-app');

        // Use slug to look up the app's ID via the public endpoint
        const tempOctokit = new Octokit();
        const { data: appData } = await tempOctokit.rest.apps.getBySlug({ app_slug: slug });
        if (!appData) {
          throw new Error(`Could not find GitHub App with slug "${slug}". Check the slug at https://github.com/settings/apps`);
        }
        const appId = String(appData.id);

        const resolved = await resolveInstallation(appId, privateKeyPem, owner, repo);

        s.stop(`Authenticated as "${resolved.appName}" (ID: ${resolved.appId})`);
        p.log.success(`Found installation for ${resolved.accountLogin} (ID: ${resolved.installationId})`);

        // Set env vars for downstream use
        process.env.GITHUB_APP_ID = appId;
        process.env.GITHUB_APP_INSTALLATION_ID = String(resolved.installationId);
        process.env.GITHUB_APP_PRIVATE_KEY = privateKeyPem;
        process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = Buffer.from(privateKeyPem).toString('base64');
      } catch (err) {
        s.stop('Authentication failed');
        return fail(
          'UNKNOWN_ERROR',
          err instanceof Error ? err.message : 'Could not authenticate with GitHub App.',
          true,
        );
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
      if (process.env.GITHUB_APP_ID) secretsToUpload['FLEET_APP_ID'] = process.env.GITHUB_APP_ID;
      if (process.env.GITHUB_APP_PRIVATE_KEY_BASE64) {
        secretsToUpload['FLEET_APP_PRIVATE_KEY'] = process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
      }
      if (process.env.GITHUB_APP_INSTALLATION_ID) {
        secretsToUpload['FLEET_APP_INSTALLATION_ID'] = process.env.GITHUB_APP_INSTALLATION_ID;
      }
    }
  }

  // ── Step 6: Dry run? ──
  const dryRun = args['dry-run'] ?? false;

  // ── Step 6b: Check for existing workflow files ──
  let overwrite = false;
  if (!dryRun) {
    const octokit = createFleetOctokit();
    const existingFiles: string[] = [];
    for (const tmpl of WORKFLOW_TEMPLATES) {
      try {
        await octokit.rest.repos.getContent({ owner, repo, path: tmpl.repoPath });
        existingFiles.push(tmpl.repoPath);
      } catch {
        // File doesn't exist — will be created fresh
      }
    }
    if (existingFiles.length > 0) {
      p.log.warn(`Found ${existingFiles.length} existing workflow file(s):`);
      for (const f of existingFiles) {
        p.log.message(`  • ${f}`);
      }
      const shouldOverwrite = await p.confirm({
        message: 'Overwrite existing workflow files with latest templates?',
        initialValue: true,
      });
      if (p.isCancel(shouldOverwrite)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
      overwrite = shouldOverwrite;
    }
  }

  // ── Step 7: Confirmation ──
  if (!dryRun) {
    const files = WORKFLOW_TEMPLATES.map((t) => t.repoPath);
    files.push('.fleet/goals/example.md');

    p.log.info([
      'Fleet will:',
      `  • Create a branch from ${baseBranch}`,
      `  • ${overwrite ? 'Overwrite' : 'Commit'} ${files.length} files`,
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

  return { owner, repo, baseBranch, authMethod, secretsToUpload, dryRun, overwrite };
}
