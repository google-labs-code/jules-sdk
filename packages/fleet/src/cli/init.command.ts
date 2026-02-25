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
import { InitInputSchema } from '../init/spec.js';
import { InitHandler } from '../init/handler.js';
import { ConfigureHandler } from '../configure/handler.js';

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Scaffold fleet workflow files by creating a PR',
  },
  args: {
    repo: {
      type: 'string',
      description: 'Repository in owner/repo format',
      required: true,
    },
    base: {
      type: 'string',
      description: 'Base branch for the PR',
      default: 'main',
    },
  },
  async run({ args }) {
    const [owner, repoName] = args.repo.split('/');

    const input = InitInputSchema.parse({
      repo: args.repo,
      owner,
      repoName,
      baseBranch: args.base,
    });

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const labelConfigurator = new ConfigureHandler(octokit);
    const handler = new InitHandler(octokit, console.log, labelConfigurator);
    const result = await handler.execute(input);

    if (!result.success) {
      console.error(`❌ ${result.error.message}`);
      if (result.error.suggestion) {
        console.error(`   💡 ${result.error.suggestion}`);
      }
      process.exit(1);
    }

    console.log(`\n✅ Fleet initialized!`);
    console.log(`   PR: ${result.data.prUrl}`);
    console.log(`   Files: ${result.data.filesCreated.join(', ')}`);
    if (result.data.labelsCreated.length > 0) {
      console.log(`   Labels: ${result.data.labelsCreated.join(', ')}`);
    }
  },
});
