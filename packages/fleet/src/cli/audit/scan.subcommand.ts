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
import { AuditHandler } from '../../audit/handler.js';
import { ScanArgsSchema, buildAuditInput } from './parse-input.js';
import { filterFindings, filterGraphFindings } from './filter-findings.js';
import { renderJson, renderHuman } from './render-output.js';
import { invalidateEntries } from '../../shared/auth/cache-plugin.js';

/**
 * `audit scan` — Run a full audit scan.
 *
 * Examples:
 *   jules-fleet audit scan                        # Full repo audit
 *   jules-fleet audit scan --milestone 3          # Audit milestone 3
 *   jules-fleet audit scan --fix                  # Preview fixable findings (dry run)
 *   jules-fleet audit scan --fix --apply          # Apply fixes
 *   jules-fleet audit scan --fixable              # Only fixable findings
 *   jules-fleet audit scan --severity warning     # Warnings and errors only
 */
export default defineCommand({
  meta: {
    name: 'scan',
    description: 'Run a full audit scan (findings + optional fix)',
  },
  args: {
    // ── Scope ──────────────────────────────────────────────────────
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
    owner: {
      type: 'string',
      description: 'Repository owner (auto-detected from git remote if omitted)',
    },
    repo: {
      type: 'string',
      description: 'Repository name (auto-detected from git remote if omitted)',
    },
    depth: {
      type: 'string',
      description: 'Max graph traversal depth (0-5, default: 2)',
      default: '2',
    },

    // ── Fix mode ───────────────────────────────────────────────────
    'dry-run': {
      type: 'boolean',
      description: 'Preview what would be auto-fixed (no writes)',
      default: false,
    },
    fix: {
      type: 'boolean',
      description: 'Apply auto-fixes',
      default: false,
    },

    // ── Filtering ──────────────────────────────────────────────────
    fixable: {
      type: 'boolean',
      description: 'Only show findings that can be auto-fixed',
      default: false,
    },
    severity: {
      type: 'string',
      description: 'Minimum severity to show (error, warning, info)',
    },

    // ── Output ─────────────────────────────────────────────────────
    json: {
      type: 'boolean',
      description: 'Output as JSON',
      default: false,
    },
    graph: {
      type: 'boolean',
      description: 'Include serialized lineage graph in JSON output (implies --json)',
      default: false,
    },
    output: {
      type: 'string',
      alias: 'o',
      description: 'Write JSON output to a file instead of stdout',
    },
  },
  async run({ args }) {
    const timing = process.env.FLEET_TIMING === '1';
    const t0 = Date.now();

    // Parse, don't validate — raw CLI args go through Zod first
    const parsed = ScanArgsSchema.parse(args);

    // 1. Parse input
    const { input, useJson, fixMode } = await buildAuditInput(parsed);

    // 2. Execute audit
    const octokit = createFleetOctokit();
    const handler = new AuditHandler({ octokit });
    const tExec = Date.now();
    const result = await handler.execute(input);
    if (timing) console.log(`\n⏱  handler.execute: ${Date.now() - tExec}ms`);

    if (!result.success) {
      console.error(`Error [${result.error.code}]: ${result.error.message}`);
      process.exit(1);
    }

    // If fixes were applied, invalidate only the mutated cache entries
    if (result.data.fixedCount > 0) {
      invalidateEntries(result.data.mutatedUrls);
    }

    // 3. Filter findings
    const filterOpts = { fixable: parsed.fixable, severity: parsed.severity };
    const filtered = filterFindings(result.data.findings, filterOpts);
    const filteredGraph = result.data.graph
      ? filterGraphFindings(result.data.graph, filterOpts)
      : undefined;

    // 4. Render output
    if (useJson) {
      renderJson(result.data, filtered, filteredGraph, {
        graph: parsed.graph,
        outputFile: parsed.output,
      });
    } else {
      renderHuman(result.data, filtered, fixMode);
    }

    if (timing) console.log(`⏱  total wall time: ${Date.now() - t0}ms`);
  },
});
