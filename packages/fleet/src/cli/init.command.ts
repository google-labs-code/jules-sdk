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
import { InitHandler } from '../init/handler.js';
import { ConfigureHandler } from '../configure/handler.js';
import { createRenderer, createEmitter, isInteractive } from '../shared/ui/index.js';
import { uploadSecret } from '../init/ops/upload-secrets.js';
import { buildWorkflowTemplates } from '../init/templates.js';
import { outputArgs, renderResult, resolveOutputFormat } from '../shared/cli/output.js';
import { inputArgs } from '../shared/cli/input.js';
import { resolveInitContext } from '../init/resolve-context.js';
import { renderInitOutput } from '../init/render-result.js';

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
    analyze: {
      type: 'string',
      description: 'Enable/disable the analyze workflow (omit value to enable, =disable to remove)',
    },
    dispatch: {
      type: 'string',
      description: 'Enable/disable the dispatch workflow',
    },
    'auto-merge': {
      type: 'string',
      description: 'Enable/disable the auto-merge workflow',
    },
    'conflict-detection': {
      type: 'string',
      description: 'Enable/disable the conflict-detection workflow',
    },
    interval: {
      type: 'string',
      description: 'Pipeline cadence in minutes (default: 360 = every 6 hours)',
      default: '360',
    },
    overwrite: {
      type: 'boolean',
      description: 'Overwrite existing workflow files (default: false)',
      default: false,
    },
    'create-repo': {
      type: 'boolean',
      description: 'Create the repo if it does not exist (default: false)',
      default: false,
    },
    visibility: {
      type: 'string',
      description: 'Repo visibility when creating: public | private (default: private)',
      default: 'private',
    },
    description: {
      type: 'string',
      description: 'Repo description when creating',
    },
    ...outputArgs,
    ...inputArgs,
  },
  async run({ args }) {
    const nonInteractive = args['non-interactive'] || !isInteractive();
    const renderer = createRenderer(!nonInteractive);
    const emit = createEmitter(renderer);

    // ── 1. Resolve context: input + secrets + octokit ──
    const ctxResult = await resolveInitContext(args, emit);

    // Propagate input resolution failure
    if ('success' in ctxResult && !ctxResult.success) {
      renderer.error(ctxResult.error.message);
      if (ctxResult.error.suggestion) {
        renderer.render({
          type: 'error',
          code: ctxResult.error.code,
          message: ctxResult.error.suggestion,
        });
      }
      process.exit(1);
    }

    const { input, secrets, octokit } = ctxResult as import('../init/resolve-context.js').InitContext;
    renderer.start(`Fleet Init — ${input.owner}/${input.repoName}`);

    // ── 2. Dry run ──
    if (args['dry-run']) {
      const files = buildWorkflowTemplates(input.intervalMinutes).map((t) => t.repoPath);
      files.push('.fleet/goals/example.md');
      const format = resolveOutputFormat(args);
      const dryRunResult = { success: true as const, data: { dryRun: true, files } };
      const json = renderResult(dryRunResult, format, args.fields as string | undefined);
      if (json !== null) {
        console.log(json);
        return;
      }
      emit({ type: 'init:dry-run', files });
      renderer.end(`Dry run complete. ${files.length} files would be created.`);
      return;
    }

    // ── 3. Execute ──
    const labelConfigurator = new ConfigureHandler({ octokit });
    const handler = new InitHandler({ octokit, emit, labelConfigurator });
    const result = await handler.execute(input);

    // ── 4. Upload secrets ──
    const secretNames = Object.keys(secrets);
    if (secretNames.length > 0) {
      for (const name of secretNames) {
        await uploadSecret(octokit, input.owner, input.repoName, name, secrets[name], emit);
      }
    }

    // ── 5. Render ──
    renderInitOutput(result, args, renderer);
  },
});
