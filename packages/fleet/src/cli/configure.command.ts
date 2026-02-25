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
      description: 'Repository owner',
      required: true,
    },
    repo: {
      type: 'string',
      description: 'Repository name',
      required: true,
    },
  },
  async run({ args }) {
    const input = ConfigureInputSchema.parse({
      resource: args.resource,
      action: args.delete ? 'delete' : 'create',
      owner: args.owner,
      repo: args.repo,
    });

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const handler = new ConfigureHandler(octokit);
    const result = await handler.execute(input);

    if (!result.success) {
      console.error(`❌ ${result.error.message}`);
      process.exit(1);
    }

    const { created, deleted, skipped } = result.data;
    if (created.length) console.log(`Created: ${created.join(', ')}`);
    if (deleted.length) console.log(`Deleted: ${deleted.join(', ')}`);
    if (skipped.length) console.log(`Skipped: ${skipped.join(', ')}`);
  },
});
