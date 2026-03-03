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
import { jules } from '@google/jules-sdk';

export default defineCommand({
  meta: {
    name: 'dispatch',
    description:
      'Poll for undispatched fleet issues and fire Jules worker sessions',
  },
  args: {
    milestone: {
      type: 'string',
      description: 'Milestone ID to scope dispatch (omit to dispatch all)',
      required: false,
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

    const octokit = createFleetOctokit();

    // Resolve milestone(s): specific one or auto-discover all
    let milestones: string[];
    if (args.milestone) {
      milestones = [args.milestone];
    } else {
      renderer.start('Fleet Dispatch — Discovering milestones');
      const { data } = await octokit.rest.issues.listMilestones({
        owner: owner!,
        repo: repo!,
        state: 'open',
      });
      milestones = data.map((m) => String(m.number));
      if (milestones.length === 0) {
        renderer.end('No open milestones found — nothing to dispatch.');
        return;
      }
      renderer.start(`Fleet Dispatch — ${milestones.length} milestone(s): ${milestones.join(', ')}`);
    }

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

    const emit = createEmitter(renderer);
    const handler = new DispatchHandler({ octokit, dispatcher, emit });

    let totalDispatched = 0;
    let totalSkipped = 0;

    for (const milestone of milestones) {
      renderer.start(`Fleet Dispatch — Milestone ${milestone}`);

      const input = DispatchInputSchema.parse({
        milestone,
        owner,
        repo,
        baseBranch: process.env.FLEET_BASE_BRANCH || 'main',
      });

      const result = await handler.execute(input);

      if (!result.success) {
        renderer.error(`Milestone ${milestone}: ${result.error.message}`);
        continue;
      }

      totalDispatched += result.data.dispatched.length;
      totalSkipped += result.data.skipped;
    }

    renderer.end(`${totalDispatched} dispatched, ${totalSkipped} skipped across ${milestones.length} milestone(s).`);
  },
});

