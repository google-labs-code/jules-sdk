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
import { WORKFLOW_TEMPLATES, buildWorkflowTemplates } from '../templates.js';
import { createFleetOctokit } from '../../shared/auth/octokit.js';
import type { InitArgs, InitWizardResult } from './types.js';
import { parseFeatureFlags } from './parse-features.js';

/**
 * Prompts user to choose auth method. Returns null if cancelled.
 */
async function promptAuthMethod(): Promise<'token' | 'app' | null> {
  const authChoice = await p.select({
    message: 'How will Fleet authenticate with GitHub?',
    options: [
      { value: 'token' as const, label: 'Personal Access Token (GITHUB_TOKEN)' },
      { value: 'app' as const, label: 'GitHub App (recommended for orgs)' },
    ],
  });
  if (p.isCancel(authChoice)) return null;
  return authChoice;
}

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
  const { AuthDetectHandler } = await import('../auth-detect/handler.js');
  const detector = new AuthDetectHandler();

  const detectResult = await detector.execute({
    owner,
    repo,
    preferredMethod: args.auth === 'token' || args.auth === 'app' ? args.auth : undefined,
  });

  let authMethod: 'token' | 'app';

  if (detectResult.success) {
    const { method, source, identity, alternatives } = detectResult.data;

    // If both methods found and no preference, ask which to use
    if (alternatives && alternatives.length > 1) {
      const choice = await p.select({
        message: `Multiple auth methods detected. Which to use?`,
        options: alternatives.map(a => ({
          value: a.method,
          label: a.method === 'app'
            ? `GitHub App (from ${a.source})`
            : `Personal Access Token (from ${a.source})`,
        })),
      });
      if (p.isCancel(choice)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
      authMethod = choice;
    } else {
      // Single method detected — confirm
      const useDetected = await p.confirm({
        message: `Authenticated as ${identity} via ${source} (${method}). Use this?`,
        initialValue: true,
      });
      if (p.isCancel(useDetected)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
      if (useDetected) {
        authMethod = method;
      } else {
        const chosen = await promptAuthMethod();
        if (!chosen) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
        authMethod = chosen;
      }
    }
  } else if (detectResult.error.code === 'REPO_NOT_FOUND') {
    // Auth is valid but repo doesn't exist — fix repo name, not credentials
    p.log.warn(detectResult.error.message);
    p.log.info(`Your credentials are valid — the repo name may be wrong.`);

    const fixedRepo = await p.text({
      message: 'Enter the correct repository (owner/repo):',
      initialValue: `${owner}/${repo}`,
      validate: (v) => !v?.includes('/') ? 'Format: owner/repo' : undefined,
    });
    if (p.isCancel(fixedRepo)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);

    const [fixedOwner, fixedRepoName] = fixedRepo.split('/');

    // Re-run detection with corrected repo
    const retryResult = await detector.execute({
      owner: fixedOwner,
      repo: fixedRepoName,
      preferredMethod: args.auth === 'token' || args.auth === 'app' ? args.auth : undefined,
    });

    if (retryResult.success) {
      authMethod = retryResult.data.method;
      p.log.success(`✓ Authenticated as ${retryResult.data.identity} with access to ${fixedOwner}/${fixedRepoName}`);
    } else {
      return fail('UNKNOWN_ERROR', retryResult.error.message, retryResult.error.recoverable);
    }
  } else {
    // Auth detection failed — show why and fall through to manual flow
    if (detectResult.error.code === 'HEALTH_CHECK_FAILED') {
      p.log.warn(`Auth check failed: ${detectResult.error.message}`);
      if (detectResult.error.suggestion) {
        p.log.info(detectResult.error.suggestion);
      }
    }

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
      const token = await p.password({
        message: 'Paste your GitHub token:',
      });
      if (p.isCancel(token)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
      process.env.GITHUB_TOKEN = token;
    } else {
      // ── GitHub App: slug → key file → auto-detect ──
      const { resolvePrivateKeyFromInput } = await import('../../shared/auth/resolve-key-input.js');
      const { resolveInstallation } = await import('../../shared/auth/resolve-installation.js');

      const slug = await p.text({
        message: 'What is your GitHub App slug? (from the URL: github.com/settings/apps/<slug>)',
        validate: (v) => !v?.trim() ? 'App slug is required' : undefined,
      });
      if (p.isCancel(slug)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);

      p.log.info(`Download your private key from: https://github.com/settings/apps/${slug}`);

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

      const s = p.spinner();
      s.start(`Authenticating as "${slug}" and finding installation for ${owner}/${repo}...`);

      try {
        const { Octokit } = await import('octokit');

        const tempOctokit = new Octokit();
        const { data: appData } = await tempOctokit.rest.apps.getBySlug({ app_slug: slug });
        if (!appData) {
          throw new Error(`Could not find GitHub App with slug "${slug}". Check the slug at https://github.com/settings/apps`);
        }
        const appId = String(appData.id);

        const resolved = await resolveInstallation(appId, privateKeyPem, owner, repo);

        s.stop(`Authenticated as "${resolved.appName}" (ID: ${resolved.appId})`);
        p.log.success(`Found installation for ${resolved.accountLogin} (ID: ${resolved.installationId})`);

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

  // ── Step 6b: Pipeline cadence ──
  let intervalMinutes = 360;
  if (!args.interval) {
    const cadenceChoice = await p.select({
      message: 'How often should Fleet run?',
      options: [
        { value: 30, label: 'Every 30 minutes', hint: 'High velocity — fast signal, more API/Actions usage' },
        { value: 60, label: 'Every hour', hint: 'Balanced — good signal, moderate usage' },
        { value: 360, label: 'Every 6 hours', hint: 'Standard (default) — reliable daily cadence' },
        { value: 720, label: 'Every 12 hours', hint: 'Conservative — twice daily' },
        { value: 1440, label: 'Every 24 hours', hint: 'Minimal — once daily' },
        { value: -1, label: 'Custom', hint: 'Enter interval in minutes' },
      ],
      initialValue: 360,
    });
    if (p.isCancel(cadenceChoice)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);

    if (cadenceChoice === -1) {
      const custom = await p.text({
        message: 'Enter interval in minutes (minimum 5):',
        initialValue: '360',
        validate: (v) => {
          const n = parseInt(v ?? '', 10);
          if (isNaN(n) || n < 5) return 'Must be a number ≥ 5 (GitHub Actions minimum)';
          return undefined;
        },
      });
      if (p.isCancel(custom)) return fail('UNKNOWN_ERROR', 'Setup cancelled.', false);
      intervalMinutes = parseInt(custom, 10);
    } else {
      intervalMinutes = cadenceChoice;
    }
  } else {
    intervalMinutes = parseInt(args.interval, 10) || 360;
  }

  // ── Step 6c: Check for existing workflow files ──
  let overwrite = false;
  if (!dryRun) {
    const features = parseFeatureFlags(args);

    const templatesToCheck = buildWorkflowTemplates(intervalMinutes);
    const octokit = createFleetOctokit();
    const existingFiles: string[] = [];
    for (const tmpl of templatesToCheck) {
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
    const files = buildWorkflowTemplates(intervalMinutes).map((t) => t.repoPath);
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

  return { owner, repo, baseBranch, authMethod, secretsToUpload, dryRun, overwrite, features: parseFeatureFlags(args), intervalMinutes };
}
