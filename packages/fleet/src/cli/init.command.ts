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
import { getGitRepoInfo } from '../shared/auth/git.js';
import { createRenderer, createEmitter } from '../shared/ui/index.js';

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
  },
  async run({ args }) {
    const renderer = createRenderer();

    // Auto-detect from git remote if --repo not provided
    let repoSlug = args.repo;
    if (!repoSlug) {
      const repoInfo = await getGitRepoInfo();
      repoSlug = `${repoInfo.owner}/${repoInfo.repo}`;
    }
    const [owner, repoName] = repoSlug.split('/');

    renderer.start(`Fleet Init — ${owner}/${repoName}`);

    const input = InitInputSchema.parse({
      repo: repoSlug,
      owner,
      repoName,
      baseBranch: args.base,
    });

    const octokit = createFleetOctokit();
    const emit = createEmitter(renderer);
    const labelConfigurator = new ConfigureHandler({ octokit });
    const handler = new InitHandler({ octokit, emit, labelConfigurator });
    const result = await handler.execute(input);

    if (!result.success) {
      renderer.error(result.error.message);
      process.exit(1);
    }

    renderer.end('Fleet initialized!');
  },
});
