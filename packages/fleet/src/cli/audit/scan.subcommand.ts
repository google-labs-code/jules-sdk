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
import { AuditInputSchema } from '../../audit/spec.js';
import { AuditHandler } from '../../audit/handler.js';

/**
 * `audit scan` — Run a full audit scan.
 *
 * Examples:
 *   jules-fleet audit scan                        # Full repo audit
 *   jules-fleet audit scan --milestone 3          # Audit milestone 3
 *   jules-fleet audit scan --fix                  # Auto-fix deterministic findings
 */
export default defineCommand({
  meta: {
    name: 'scan',
    description: 'Run a full audit scan (findings + optional fix)',
  },
  args: {
    milestone: {
      type: 'string',
      description: 'Scope audit to a milestone (number)',
    },
    issue: {
      type: 'string',
      description: 'Scope audit to a specific issue (number)',
    },
    pr: {
      type: 'string',
      description: 'Scope audit to a specific PR (number)',
    },
    fix: {
      type: 'boolean',
      description: 'Auto-fix deterministic findings',
      default: false,
    },
    depth: {
      type: 'string',
      description: 'Max graph traversal depth (0-5, default: 2)',
      default: '2',
    },
    json: {
      type: 'boolean',
      description: 'Output as JSON',
      default: false,
    },
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
    let owner = args.owner;
    let repo = args.repo;
    if (!owner || !repo) {
      const repoInfo = await getGitRepoInfo();
      owner = owner || repoInfo.owner;
      repo = repo || repoInfo.repo;
    }

    // Determine entry point
    let entryPoint: any = { kind: 'full' };
    if (args.milestone) entryPoint = { kind: 'milestone', id: args.milestone };
    if (args.issue) entryPoint = { kind: 'issue', id: args.issue };
    if (args.pr) entryPoint = { kind: 'pr', id: args.pr };

    const input = AuditInputSchema.parse({
      owner,
      repo,
      entryPoint,
      fix: args.fix,
      depth: Number(args.depth),
      format: args.json ? 'json' : 'human',
    });

    const octokit = createFleetOctokit();
    const handler = new AuditHandler({ octokit });
    const result = await handler.execute(input);

    if (!result.success) {
      console.error(`Error [${result.error.code}]: ${result.error.message}`);
      process.exit(1);
    }

    if (args.json) {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.log(`\n📋 Audit Results`);
      console.log(`   Nodes scanned: ${result.data.nodesScanned}`);
      console.log(`   Findings: ${result.data.totalFindings}`);
      console.log(`   Fixed: ${result.data.fixedCount}`);
      console.log(`   Unresolved edges: ${result.data.unresolvedEdges}`);

      if (result.data.findings.length > 0) {
        console.log(`\n   Findings:`);
        for (const f of result.data.findings) {
          const icon = f.severity === 'error' ? '❌' : f.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
          const fix = f.fixed ? ' ✅ (fixed)' : f.fixability === 'deterministic' ? ' 🔧 (fixable with --fix)' : '';
          console.log(`   ${icon} [${f.type}] ${f.detail}${fix}`);
        }
      }
    }
  },
});
