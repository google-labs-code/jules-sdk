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
import { ConfigureInputSchema } from '../configure/spec.js';
import { ConfigureHandler } from '../configure/handler.js';
import { createFleetOctokit } from '../shared/auth/octokit.js';
import { getGitRepoInfo } from '../shared/auth/git.js';
import { createRenderer, createEmitter } from '../shared/ui/index.js';

export default defineCommand({
  meta: {
    name: 'configure',
    description: 'Configure fleet repo resources (labels, etc.)',
  },
  args: {
    resource: {
      type: 'positional',
      description: 'Resource to configure (labels)',
      required: true,
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

    const action = args.delete ? 'delete' : 'create';
    renderer.start(`Fleet Configure — ${args.resource} (${action})`);

    const input = ConfigureInputSchema.parse({
      resource: args.resource,
      action,
      owner,
      repo,
    });

    const octokit = createFleetOctokit();
    const emit = createEmitter(renderer);
    const handler = new ConfigureHandler({ octokit, emit });
    const result = await handler.execute(input);

    if (!result.success) {
      renderer.error(result.error.message);
      process.exit(1);
    }

    renderer.end(`${args.resource} configured.`);
  },
});
