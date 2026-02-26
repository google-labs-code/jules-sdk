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
import { AnalyzeInputSchema } from '../analyze/spec.js';
import { AnalyzeHandler } from '../analyze/handler.js';
import { createFleetOctokit } from '../shared/auth/octokit.js';
import { getGitRepoInfo } from '../shared/auth/git.js';
import { createRenderer, createEmitter } from '../shared/ui/index.js';
import type { SessionDispatcher } from '../shared/session-dispatcher.js';

export default defineCommand({
  meta: {
    name: 'analyze',
    description:
      'Read goal file(s), fetch milestone context, and fire Jules analyzer sessions',
  },
  args: {
    goal: {
      type: 'string',
      description: 'Path to a specific goal file',
    },
    'goals-dir': {
      type: 'string',
      default: '.fleet/goals',
      description: 'Directory to auto-discover goal files from',
    },
    milestone: {
      type: 'string',
      description: 'Milestone ID to scope context',
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

    renderer.start(`Fleet Analyze — ${owner}/${repo}`);

    const input = AnalyzeInputSchema.parse({
      goal: args.goal || undefined,
      goalsDir: args['goals-dir'],
      milestone: args.milestone || undefined,
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
    const handler = new AnalyzeHandler({ octokit, dispatcher, emit });
    const result = await handler.execute(input);

    if (!result.success) {
      renderer.error(result.error.message);
      process.exit(1);
    }

    renderer.end(
      `${result.data.sessionsStarted.length} session(s) dispatched.`,
    );
  },
});
