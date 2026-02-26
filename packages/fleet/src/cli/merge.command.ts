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
    const input = MergeInputSchema.parse({
      mode: args.mode,
      runId: args['run-id'] || undefined,
      baseBranch: args.base,
      admin: args.admin,
      reDispatch: args['re-dispatch'],
      owner: args.owner,
      repo: args.repo,
    });

    const octokit = createFleetOctokit();
    const handler = new MergeHandler(octokit);
    const result = await handler.execute(input);

    if (!result.success) {
      console.error(`❌ ${result.error.message}`);
      if (result.error.suggestion) {
        console.error(`   💡 ${result.error.suggestion}`);
      }
      process.exit(1);
    }

    const { merged, skipped, redispatched } = result.data;
    console.log(`\nMerged: ${merged.length}, Skipped: ${skipped.length}, Re-dispatched: ${redispatched.length}`);
  },
});
