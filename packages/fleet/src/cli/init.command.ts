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

import { defineCommand } from 'citty';
import { InitInputSchema } from '../init/spec.js';
import { InitHandler } from '../init/handler.js';
import { ConfigureHandler } from '../configure/handler.js';
import { createFleetOctokit } from '../shared/auth/octokit.js';
import { createRenderer, createEmitter, isInteractive } from '../shared/ui/index.js';
import { runInitWizard, validateHeadlessInputs } from '../init/wizard/index.js';
import type { InitArgs } from '../init/wizard/types.js';
import { uploadSecret } from '../init/ops/upload-secrets.js';
import { WORKFLOW_TEMPLATES } from '../init/templates.js';

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Scaffold fleet workflow files by creating a PR',
  },
  args: {
    repo: {
      type: 'string',
      description: 'Repository in owner/repo format (auto-detected from git remote if omitted)',
    },
    base: {
      type: 'string',
      description: 'Base branch for the PR',
      default: 'main',
    },
    'non-interactive': {
      type: 'boolean',
      description: 'Disable wizard prompts — all inputs via flags/env vars',
      default: false,
    },
    'dry-run': {
      type: 'boolean',
      description: 'Show what would be created without making changes',
      default: false,
    },
    auth: {
      type: 'string',
      description: 'Auth mode: token | app (auto-detected from env vars)',
    },
    'app-id': {
      type: 'string',
      description: 'GitHub App ID (overrides GITHUB_APP_ID env var)',
    },
    'installation-id': {
      type: 'string',
      description: 'GitHub App Installation ID (overrides env var)',
    },
    'upload-secrets': {
      type: 'boolean',
      description: 'Upload secrets to GitHub Actions (default: true in interactive, false in non-interactive)',
    },
  },
  async run({ args }) {
    const nonInteractive = args['non-interactive'] || !isInteractive();
    const renderer = createRenderer(!nonInteractive);
    const emit = createEmitter(renderer);

    // ── Collect inputs: wizard or headless ──
    const wizardArgs = args as unknown as InitArgs;
    const inputs = nonInteractive
      ? await validateHeadlessInputs(wizardArgs, emit)
      : await runInitWizard(wizardArgs, emit);

    // Check if input collection failed
    if ('success' in inputs && !inputs.success) {
      renderer.error(inputs.error.message);
      if (inputs.error.suggestion) {
        renderer.render({
          type: 'error',
          code: inputs.error.code,
          message: inputs.error.suggestion,
        });
      }
      process.exit(1);
    }

    const { owner, repo, baseBranch, secretsToUpload, dryRun, overwrite } = inputs as Exclude<typeof inputs, { success: false }>;

    renderer.start(`Fleet Init — ${owner}/${repo}`);

    // ── Dry run: list files and exit ──
    if (dryRun) {
      const files = WORKFLOW_TEMPLATES.map((t) => t.repoPath);
      files.push('.fleet/goals/example.md');
      emit({ type: 'init:dry-run', files });
      renderer.end(`Dry run complete. ${files.length} files would be created.`);
      return;
    }

    // ── Execute init pipeline ──
    const input = InitInputSchema.parse({
      repo: `${owner}/${repo}`,
      owner,
      repoName: repo,
      baseBranch,
      overwrite,
    });

    const octokit = createFleetOctokit();
    const labelConfigurator = new ConfigureHandler({ octokit });
    const handler = new InitHandler({ octokit, emit, labelConfigurator });
    const result = await handler.execute(input);

    // ── Upload secrets (always, even if files already exist) ──
    const secretNames = Object.keys(secretsToUpload);
    if (secretNames.length > 0) {
      for (const name of secretNames) {
        await uploadSecret(octokit, owner, repo, name, secretsToUpload[name], emit);
      }
    }

    if (!result.success) {
      renderer.error(result.error.message);
      if (result.error.suggestion) {
        renderer.render({
          type: 'error',
          code: result.error.code,
          message: result.error.suggestion,
        });
      }
      // If secrets were uploaded despite file failure, note partial success
      if (secretNames.length > 0) {
        renderer.end(`${secretNames.length} secret(s) uploaded, but no new files were committed.`);
      }
      process.exit(1);
    }

    renderer.end('Fleet initialized! Merge the PR to activate Fleet.');
  },
});
