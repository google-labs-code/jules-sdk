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

/**
 * E2E tests for the audit module against a real GitHub repo.
 *
 * Run with: GITHUB_TOKEN=$(gh auth token) npx vitest run src/__tests__/audit-e2e.test.ts
 *
 * These tests hit the live GitHub API and are skipped when GITHUB_TOKEN is not set.
 */

import { describe, it, expect } from 'vitest';
import { Octokit } from 'octokit';
import { AuditHandler } from '../audit/handler.js';
import { buildLineage } from '../audit/graph/build-lineage.js';
import { nodeKey } from '../audit/graph/types.js';
import { listUndispatchedIssues } from '../audit/ops/list-undispatched-issues.js';
import { scanItem } from '../audit/ops/scan-item.js';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = 'davideast';
const REPO = 'jules-sdk-python';

const describeE2E = GITHUB_TOKEN ? describe : describe.skip;

function createOctokit(): Octokit {
  return new Octokit({ auth: GITHUB_TOKEN });
}

describeE2E('Audit E2E — google-labs-code/jules-sdk', () => {
  // ── listUndispatchedIssues ─────────────────────────────────────

  it('listUndispatchedIssues returns array (may be empty)', async () => {
    const octokit = createOctokit();
    const issues = await listUndispatchedIssues(octokit, OWNER, REPO);

    expect(Array.isArray(issues)).toBe(true);
    console.log(`   📋 Undispatched fleet issues: ${issues.length}`);
    for (const issue of issues.slice(0, 5)) {
      console.log(`     #${issue.number}: ${issue.title}`);
    }
  }, 30_000);

  // ── buildLineage for a known issue ─────────────────────────────

  it('builds lineage graph from a real issue', async () => {
    const octokit = createOctokit();

    // Find a fleet issue to test with, or use a known one
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner: OWNER,
      repo: REPO,
      labels: 'fleet',
      state: 'all',
      per_page: 1,
    });

    if (issues.length === 0) {
      console.log('   ⚠️  No fleet issues found — skipping lineage test');
      return;
    }

    const issue = issues[0];
    console.log(`   🌳 Building lineage from issue #${issue.number}: ${issue.title}`);

    const graph = await buildLineage(
      { octokit },
      OWNER,
      REPO,
      { kind: 'issue', id: String(issue.number) },
      { depth: 1 },
    );

    expect(graph.nodes.size).toBeGreaterThan(0);
    expect(graph.root).toEqual({ kind: 'issue', id: String(issue.number) });

    console.log(`     Nodes: ${graph.nodes.size}`);
    console.log(`     Unresolved edges: ${graph.unresolvedEdges.length}`);
    for (const [key, node] of graph.nodes) {
      const edgeStr = node.edges.map((e) => `${e.relation}→${nodeKey(e.target)}`).join(', ');
      console.log(`     ${key}: edges=[${edgeStr}]`);
    }
    for (const edge of graph.unresolvedEdges) {
      console.log(`     ⚠️  ${nodeKey(edge.from)} --${edge.expectedRelation}--> ? (${edge.reason})`);
    }
  }, 30_000);

  // ── buildLineage for a real PR ─────────────────────────────────

  it('builds lineage graph from a real PR', async () => {
    const octokit = createOctokit();

    // Find a recent PR
    const { data: prs } = await octokit.rest.pulls.list({
      owner: OWNER,
      repo: REPO,
      state: 'all',
      per_page: 1,
    });

    if (prs.length === 0) {
      console.log('   ⚠️  No PRs found — skipping');
      return;
    }

    const pr = prs[0];
    console.log(`   🌳 Building lineage from PR #${pr.number}: ${pr.title}`);

    const graph = await buildLineage(
      { octokit },
      OWNER,
      REPO,
      { kind: 'pr', id: String(pr.number) },
      { depth: 1 },
    );

    expect(graph.nodes.size).toBeGreaterThan(0);
    console.log(`     Nodes: ${graph.nodes.size}`);
    for (const [key, node] of graph.nodes) {
      console.log(`     ${key}: ${node.edges.length} edges`);
    }
  }, 30_000);

  // ── scanItem on real data ──────────────────────────────────────

  it('scans a real fleet issue for findings', async () => {
    const octokit = createOctokit();

    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner: OWNER,
      repo: REPO,
      labels: 'fleet',
      state: 'all',
      per_page: 1,
    });

    if (issues.length === 0) {
      console.log('   ⚠️  No fleet issues — skipping scan');
      return;
    }

    const issue = issues[0];

    // Build a shallow graph to get a proper GraphNode
    const graph = await buildLineage(
      { octokit },
      OWNER,
      REPO,
      { kind: 'issue', id: String(issue.number) },
      { depth: 0 },
    );

    const node = graph.nodes.get(nodeKey({ kind: 'issue', id: String(issue.number) }));
    expect(node).toBeDefined();

    const findings = scanItem(node!, graph.unresolvedEdges);
    console.log(`   🔍 Scan issue #${issue.number}: ${findings.length} finding(s)`);
    for (const f of findings) {
      const icon = f.severity === 'error' ? '❌' : f.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
      console.log(`     ${icon} [${f.type}] ${f.detail}`);
    }
  }, 30_000);

  // ── Full AuditHandler scan ─────────────────────────────────────

  it('runs full audit scan on a single issue', async () => {
    const octokit = createOctokit();

    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner: OWNER,
      repo: REPO,
      labels: 'fleet',
      state: 'all',
      per_page: 1,
    });

    if (issues.length === 0) {
      console.log('   ⚠️  No fleet issues — skipping handler test');
      return;
    }

    const handler = new AuditHandler({ octokit });
    const result = await handler.execute({
      owner: OWNER,
      repo: REPO,
      baseBranch: 'main',
      entryPoint: { kind: 'issue', id: String(issues[0].number) },
      fixMode: 'off',
      depth: 1,
      format: 'human',
      includeGraph: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      console.log(`   📋 Audit Results:`);
      console.log(`     Nodes scanned: ${result.data.nodesScanned}`);
      console.log(`     Findings: ${result.data.totalFindings}`);
      console.log(`     Unresolved edges: ${result.data.unresolvedEdges}`);
      for (const f of result.data.findings) {
        const icon = f.severity === 'error' ? '❌' : f.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
        console.log(`     ${icon} [${f.type}] ${f.detail}`);
      }
    }
  }, 60_000);
});
