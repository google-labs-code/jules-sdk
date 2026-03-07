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
import { createFleetOctokit } from '../../shared/auth/octokit.js';
import { getGitRepoInfo } from '../../shared/auth/git.js';
import { listUndispatchedIssues } from '../../audit/ops/list-undispatched-issues.js';
import { outputArgs, renderResult, resolveOutputFormat } from '../../shared/cli/output.js';

/**
 * `audit list` — Query operations.
 *
 * Examples:
 *   jules-fleet audit list issues --undispatched  # List undispatched issues
 */
export default defineCommand({
  meta: {
    name: 'list',
    description: 'Query operations (list issues, PRs, etc.)',
  },
  args: {
    type: {
      type: 'positional',
      description: 'Resource type: issues or prs',
      required: true,
    },
    undispatched: {
      type: 'boolean',
      description: 'Filter to undispatched fleet issues',
      default: false,
    },
    ...outputArgs,
    owner: {
      type: 'string',
      description: 'Repository owner',
    },
    repo: {
      type: 'string',
      description: 'Repository name',
    },
  },
  async run({ args }) {
    let owner = args.owner;
    let repo = args.repo;
    if (!owner || !repo) {
      const repoInfo = await getGitRepoInfo();
      owner = owner || repoInfo.owner;
      repo = repo || repoInfo.repo;
    }

    const octokit = createFleetOctokit();

    if (args.type === 'issues' && args.undispatched) {
      const issues = await listUndispatchedIssues(octokit, owner, repo);
      const format = resolveOutputFormat(args);
      const result = { success: true as const, data: { issues } };
      const json = renderResult(result, format, args.fields as string | undefined);
      if (json !== null) {
        console.log(json);
      } else {
        console.log(`\n📋 Undispatched Fleet Issues (${issues.length}):`);
        for (const issue of issues) {
          console.log(`   #${issue.number}: ${issue.title}${issue.milestone ? ` [${issue.milestone}]` : ''}`);
        }
      }
    } else {
      console.error(`Unsupported: list ${args.type}${args.undispatched ? ' --undispatched' : ''}`);
      console.error('Available: list issues --undispatched');
      process.exit(1);
    }
  },
});
