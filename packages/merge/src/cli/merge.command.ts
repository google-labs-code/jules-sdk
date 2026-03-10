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
import { mergeHandler } from '../reconcile/merge-handler.js';
import { parseJsonInput, getExitCode } from '../shared/errors.js';

export default defineCommand({
  meta: {
    name: 'merge',
    description: 'Merge the reconciliation PR using a merge commit',
  },
  args: {
    json: {
      type: 'string',
      description: 'Raw JSON payload: { "pr": 999, "repo": "owner/repo" }',
    },
    pr: {
      type: 'string',
      description: 'PR number to merge',
    },
    repo: {
      type: 'string',
      description: 'Repository in owner/repo format',
    },
  },
  async run({ args }) {
    try {
      const octokit = createMergeOctokit();
      const input =
        parseJsonInput(args.json) || {
          pr: Number(args.pr) || 0,
          repo: args.repo || '',
        };
      const result = await mergeHandler(octokit, input);
      console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.error(JSON.stringify({ error: err.message }));
      process.exit(getExitCode(err));
    }
  },
});
