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
import { Octokit } from 'octokit';
import { ConfigureInputSchema } from '../configure/spec.js';
import { ConfigureHandler } from '../configure/handler.js';
import { createFleetOctokit } from '../shared/auth/octokit.js';
import { getGitRepoInfo } from '../shared/auth/git.js';
import { createRenderer, createEmitter } from '../shared/ui/index.js';
import { outputArgs, renderResult, resolveOutputFormat } from '../shared/cli/output.js';

export default defineCommand({
  meta: {
    name: 'configure',
    description: 'Configure fleet repo resources (labels, etc.)',
  },
  args: {
    json: {
      type: 'string',
      description: 'JSON input (agent mode) — full API payload',
    },
    resource: {
      type: 'positional',
      description: 'Resource to configure (labels | milestones | secrets)',
    },
    auth: {
      type: 'string',
      description: 'Auth mode: token (GITHUB_TOKEN) or app (GitHub App)',
    },
    title: {
      type: 'string',
      description: 'Milestone title (required if resource is milestones)',
    },
    delete: {
      type: 'boolean',
      description: 'Delete resources instead of creating them',
      default: false,
    },
    owner: {
      type: 'string',
      description: 'Repository owner (auto-detected from git remote if omitted)',
    },
    repo: {
      type: 'string',
      description: 'Repository name (auto-detected from git remote if omitted)',
    },
    ...outputArgs,
    'dry-run': {
      type: 'boolean',
      description: 'Show what would be created/deleted (no changes made)',
      default: false,
    },
  },
  async run({ args }) {
    const renderer = createRenderer();
    const format = resolveOutputFormat(args);

    // ── Helper: build Octokit based on auth mode ──
    function buildOctokit(auth: 'token' | 'app'): InstanceType<typeof Octokit> {
      if (auth === 'app') return createFleetOctokit();
      return new Octokit({ auth: process.env.GITHUB_TOKEN });
    }

    // ── Agent path: --json takes the full API payload ──
    if (args.json) {
      const input = ConfigureInputSchema.parse(JSON.parse(args.json as string));
      renderer.start(`Fleet Configure — ${input.resource} (${input.action})`);

      if (args['dry-run']) {
        const preview = {
          success: true as const,
          data: { dryRun: true, action: input.action, resource: input.resource, repo: `${input.owner}/${input.repo}` },
        };
        const previewJson = renderResult(preview, format, args.fields as string | undefined);
        console.log(previewJson ?? `Dry run: would ${input.action} ${input.resource} in ${input.owner}/${input.repo}`);
        return;
      }

      const octokit = buildOctokit(input.auth);
      const emit = createEmitter(renderer);
      const handler = new ConfigureHandler({ octokit, emit });
      const result = await handler.execute(input);
      const json = renderResult(result, format, args.fields as string | undefined);
      if (json !== null) {
        console.log(json);
        if (!result.success) process.exit(1);
        return;
      }
      if (!result.success) {
        renderer.error(result.error.message);
        process.exit(1);
      }
      renderer.end(`${input.resource} configured.`);
      return;
    }

    // ── Human path: positional args + git auto-detect ──
    let owner = args.owner;
    let repo = args.repo;
    if (!owner || !repo) {
      const repoInfo = await getGitRepoInfo();
      owner = owner || repoInfo.owner;
      repo = repo || repoInfo.repo;
    }

    const action = args.delete ? 'delete' : 'create';
    renderer.start(`Fleet Configure — ${args.resource} (${action})`);

    let milestone = args.title;
    if (args.resource === 'milestones' && !milestone) {
        const fs = await import('fs');
        const path = await import('path');
        const goalsDir = '.fleet/goals';
        if (fs.existsSync(goalsDir)) {
            const files = fs.readdirSync(goalsDir).filter(f => f.endsWith('.md'));
            if (files.length > 0) {
                const firstGoalPath = path.join(goalsDir, files[0]);
                const content = fs.readFileSync(firstGoalPath, 'utf-8');
                const match = content.match(/^milestone:\s*(.+)$/m);
                if (match) {
                    milestone = match[1].trim();
                }
            }
        }
    }

    const input = ConfigureInputSchema.parse({
      resource: args.resource,
      action,
      owner,
      repo,
      milestone,
      auth: args.auth ?? 'token',
    });

    if (args['dry-run']) {
      const preview = {
        success: true as const,
        data: {
          dryRun: true,
          action: input.action,
          resource: input.resource,
          repo: `${input.owner}/${input.repo}`,
          milestone: input.milestone,
        },
      };
      const previewJson = renderResult(preview, format, args.fields as string | undefined);
      console.log(
        previewJson ??
        `Dry run: would ${input.action} ${input.resource} in ${input.owner}/${input.repo}`,
      );
      return;
    }

    const octokit = buildOctokit(input.auth);
    const emit = createEmitter(renderer);
    const handler = new ConfigureHandler({ octokit, emit });
    const result = await handler.execute(input);
    const json = renderResult(result, format, args.fields as string | undefined);
    if (json !== null) {
      console.log(json);
      if (!result.success) process.exit(1);
      return;
    }

    if (!result.success) {
      renderer.error(result.error.message);
      process.exit(1);
    }

    renderer.end(`${args.resource} configured.`);
  },
});
