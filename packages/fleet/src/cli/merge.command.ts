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
import { MergeInputSchema } from '../merge/spec.js';
import { MergeHandler } from '../merge/handler.js';
import { createFleetOctokit } from '../shared/auth/octokit.js';
import { getGitRepoInfo } from '../shared/auth/git.js';
import { createRenderer, createEmitter } from '../shared/ui/index.js';

export default defineCommand({
  meta: {
    name: 'merge',
    description: 'Sequentially merge fleet PRs (label or fleet-run mode)',
  },
  args: {
    mode: {
      type: 'string',
      description: 'PR selection mode: label or fleet-run',
      default: 'label',
    },
    'run-id': {
      type: 'string',
      description: 'Fleet run ID (required for fleet-run mode)',
      default: '',
    },
    base: {
      type: 'string',
      description: 'Base branch to merge into',
      default: process.env.FLEET_BASE_BRANCH || 'main',
    },
    admin: {
      type: 'boolean',
      description: 'Use admin privileges to bypass branch protection',
      default: false,
    },
    're-dispatch': {
      type: 'boolean',
      description: 'Automatically re-dispatch tasks on merge conflict (requires JULES_API_KEY)',
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
  },
  async run({ args }) {
    const renderer = createRenderer();

    // Auto-detect owner/repo from git remote if not provided
    let owner = args.owner;
    let repo = args.repo;
    if (!owner || !repo) {
      const repoInfo = await getGitRepoInfo();
      owner = owner || repoInfo.owner;
      repo = repo || repoInfo.repo;
    }

    renderer.start(`Fleet Merge — ${owner}/${repo} (${args.mode} mode)`);

    const input = MergeInputSchema.parse({
      mode: args.mode,
      runId: args['run-id'] || undefined,
      baseBranch: args.base,
      admin: args.admin,
      reDispatch: args['re-dispatch'],
      owner,
      repo,
    });

    const octokit = createFleetOctokit();
    const emit = createEmitter(renderer);
    const handler = new MergeHandler({ octokit, emit });
    const result = await handler.execute(input);

    if (!result.success) {
      renderer.error(result.error.message);
      process.exit(1);
    }

    renderer.end('Sequential merge complete.');
  },
});
