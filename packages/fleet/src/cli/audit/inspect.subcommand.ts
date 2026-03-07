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
import { outputArgs, renderResult, resolveOutputFormat } from '../../shared/cli/output.js';
import { inspectLineage, renderInspectHuman } from '../../audit/ops/inspect-lineage.js';

/**
 * `audit inspect` — Show lineage graph for a specific item.
 *
 * Examples:
 *   jules-fleet audit inspect issue 42                       # Human-readable graph
 *   jules-fleet audit inspect issue 42 --output json         # JSON output
 *   jules-fleet audit inspect pr 99 --output json --fields root,nodes
 */
export default defineCommand({
  meta: {
    name: 'inspect',
    description: 'Show lineage graph for a specific item',
  },
  args: {
    type: {
      type: 'positional',
      description: 'Resource type: issue or pr',
      required: true,
    },
    id: {
      type: 'positional',
      description: 'Resource ID (number)',
      required: true,
    },
    depth: {
      type: 'string',
      description: 'Max traversal depth (default: 2)',
      default: '2',
    },
    ...outputArgs,
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
    // Resolve owner/repo
    let owner = args.owner;
    let repo = args.repo;
    if (!owner || !repo) {
      const repoInfo = await getGitRepoInfo();
      owner = owner || repoInfo.owner;
      repo = repo || repoInfo.repo;
    }

    // Execute via ops module
    const kind = args.type === 'pr' ? 'pr' : 'issue';
    const octokit = createFleetOctokit();
    const data = await inspectLineage(octokit, owner, repo, { kind, id: args.id }, { depth: Number(args.depth) });

    // Render output
    const format = resolveOutputFormat(args);
    const result = { success: true as const, data };
    const json = renderResult(result, format, args.fields as string | undefined);
    if (json !== null) {
      console.log(json);
    } else {
      console.log(renderInspectHuman(data));
    }
  },
});
