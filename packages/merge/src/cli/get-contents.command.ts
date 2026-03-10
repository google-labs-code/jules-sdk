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
import { getContentsHandler } from '../reconcile/get-contents-handler.js';
import { parseJsonInput, getExitCode } from '../shared/errors.js';

export default defineCommand({
  meta: {
    name: 'get-contents',
    description: 'Fetch file content from base, main, or a specific PR',
  },
  args: {
    json: {
      type: 'string',
      description: 'Raw JSON payload: { "filePath": "src/foo.ts", "source": "base", "repo": "owner/repo" }',
    },
    file: {
      type: 'string',
      description: 'File path within the repo',
    },
    source: {
      type: 'string',
      description: 'Content source: "base", "main", or "pr:<N>"',
    },
    repo: {
      type: 'string',
      description: 'Repository in owner/repo format',
    },
    baseSha: {
      type: 'string',
      description: 'Explicit base SHA (optional, used with source=base)',
    },
  },
  async run({ args }) {
    try {
      const octokit = createMergeOctokit();
      const input =
        parseJsonInput(args.json) || {
          filePath: args.file || '',
          source: args.source || '',
          repo: args.repo || '',
          baseSha: args.baseSha,
        };
      const result = await getContentsHandler(octokit, input);
      console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.error(JSON.stringify({ error: err.message }));
      process.exit(getExitCode(err));
    }
  },
});
