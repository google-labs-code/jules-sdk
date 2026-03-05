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
import { buildLineage } from '../../audit/graph/build-lineage.js';
import { nodeKey } from '../../audit/graph/types.js';

/**
 * `audit inspect` — Show lineage graph for a specific item.
 *
 * Examples:
 *   jules-fleet audit inspect issue 42    # Lineage graph for issue #42
 *   jules-fleet audit inspect pr 99       # Lineage graph for PR #99
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
    json: {
      type: 'boolean',
      description: 'Output as JSON',
      default: false,
    },
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

    const kind = args.type === 'pr' ? 'pr' : 'issue';
    const octokit = createFleetOctokit();

    const graph = await buildLineage(
      { octokit },
      owner,
      repo,
      { kind, id: args.id },
      { depth: Number(args.depth) },
    );

    if (args.json) {
      const serialized = {
        root: graph.root,
        nodes: Array.from(graph.nodes.entries()).map(([key, node]) => ({
          key,
          ref: node.ref,
          edges: node.edges.length,
          data: { title: node.data.title, state: node.data.state },
        })),
        unresolvedEdges: graph.unresolvedEdges,
      };
      console.log(JSON.stringify(serialized, null, 2));
    } else {
      console.log(`\n🌳 Lineage Graph (root: ${nodeKey(graph.root)})`);
      console.log(`   Nodes: ${graph.nodes.size}`);
      console.log(`   Unresolved edges: ${graph.unresolvedEdges.length}`);

      for (const [key, node] of graph.nodes) {
        const title = (node.data.title as string) || node.ref.id;
        console.log(`\n   ${key}: ${title}`);
        for (const edge of node.edges) {
          const status = edge.resolved ? '→' : '⚠';
          console.log(`     ${status} ${edge.relation} → ${nodeKey(edge.target)}`);
        }
      }

      if (graph.unresolvedEdges.length > 0) {
        console.log(`\n   ⚠️  Unresolved Edges:`);
        for (const edge of graph.unresolvedEdges) {
          console.log(`     ${nodeKey(edge.from)} --${edge.expectedRelation}--> ? (${edge.reason})`);
        }
      }
    }
  },
});
