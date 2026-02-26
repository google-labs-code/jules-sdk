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
import { DispatchInputSchema } from '../dispatch/spec.js';
import { DispatchHandler } from '../dispatch/handler.js';
import { createFleetOctokit } from '../shared/auth/octokit.js';
import { getGitRepoInfo } from '../shared/auth/git.js';
import { createRenderer, createEmitter } from '../shared/ui/index.js';
import type { SessionDispatcher } from '../shared/session-dispatcher.js';

export default defineCommand({
  meta: {
    name: 'dispatch',
    description:
      'Poll for undispatched fleet issues and fire Jules worker sessions',
  },
  args: {
    milestone: {
      type: 'string',
      description: 'Milestone ID to scope dispatch',
      required: true,
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

    renderer.start(`Fleet Dispatch — Milestone ${args.milestone}`);

    const input = DispatchInputSchema.parse({
      milestone: args.milestone,
      owner,
      repo,
      baseBranch: process.env.FLEET_BASE_BRANCH || 'main',
    });

    // Lazy-import Jules SDK — composition root wires real dispatcher
    const { jules } = await import('@google/jules-sdk');
    const dispatcher: SessionDispatcher = {
      async dispatch(options) {
        return jules.session({
          prompt: options.prompt,
          source: options.source,
          requireApproval: options.requireApproval,
          autoPr: options.autoPr,
        });
      },
    };

    const octokit = createFleetOctokit();
    const emit = createEmitter(renderer);
    const handler = new DispatchHandler({ octokit, dispatcher, emit });
    const result = await handler.execute(input);

    if (!result.success) {
      renderer.error(result.error.message);
      process.exit(1);
    }

    const { dispatched, skipped } = result.data;
    renderer.end(`${dispatched.length} dispatched, ${skipped} skipped.`);
  },
});
