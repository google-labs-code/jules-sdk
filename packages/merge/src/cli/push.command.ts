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
import { createMergeOctokit } from '../shared/auth.js';
import { pushHandler } from '../reconcile/push-handler.js';
import { parseJsonInput, getExitCode } from '../shared/errors.js';

export default defineCommand({
  meta: {
    name: 'push',
    description: 'Create the multi-parent reconciliation commit and PR',
  },
  args: {
    json: {
      type: 'string',
      description: 'Raw JSON payload',
    },
    branch: {
      type: 'string',
      description: 'Target branch name for the reconciliation PR',
    },
    message: {
      type: 'string',
      description: 'Commit message',
    },
    repo: {
      type: 'string',
      description: 'Repository in owner/repo format',
    },
    dryRun: {
      type: 'boolean',
      description: 'Validate without pushing',
      default: false,
    },
    mergeStrategy: {
      type: 'string',
      description: '"sequential" (default) or "octopus"',
      default: 'sequential',
    },
    prTitle: {
      type: 'string',
      description: 'Custom PR title (defaults to commit message)',
    },
    prBody: {
      type: 'string',
      description: 'Custom PR body',
    },
  },
  async run({ args }) {
    try {
      const octokit = createMergeOctokit();
      const input =
        parseJsonInput(args.json) || {
          branch: args.branch || '',
          message: args.message || '',
          repo: args.repo || '',
          dryRun: args.dryRun,
          mergeStrategy: args.mergeStrategy as
            | 'sequential'
            | 'octopus',
          prTitle: args.prTitle,
          prBody: args.prBody,
        };
      const result = await pushHandler(octokit, input);
      console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.error(JSON.stringify({ error: err.message }));
      process.exit(getExitCode(err));
    }
  },
});
