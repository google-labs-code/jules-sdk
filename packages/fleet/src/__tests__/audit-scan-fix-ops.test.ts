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

import { describe, it, expect, vi } from 'vitest';
import { scanItem } from '../audit/ops/scan-item.js';
import { listUndispatchedIssues } from '../audit/ops/list-undispatched-issues.js';
import { addLabel } from '../audit/ops/add-label.js';
import { assignMilestone } from '../audit/ops/assign-milestone.js';
import { copyMilestone } from '../audit/ops/copy-milestone.js';
import type { GraphNode, UnresolvedEdge } from '../audit/graph/types.js';

// ── scanItem ───────────────────────────────────────────────────────

describe('scanItem', () => {
  it('detects missing milestone on fleet issue', () => {
    const node: GraphNode = {
      ref: { kind: 'issue', id: '10' },
      data: {
        labels: [{ name: 'fleet' }],
        body: 'Some body\n\n---\n**Fleet Context**\n- Source: `jules:session:s-1`',
        milestone: null,
      },
      edges: [
        { relation: 'fixes', target: { kind: 'pr', id: '42' }, resolved: true },
      ],
    };

    const findings = scanItem(node, []);
    const milestoneFindings = findings.filter((f) => f.type === 'issue:missing-milestone');
    expect(milestoneFindings).toHaveLength(1);
    expect(milestoneFindings[0].fixability).toBe('cognitive');
  });

  it('detects missing source on fleet issue', () => {
    const node: GraphNode = {
      ref: { kind: 'issue', id: '10' },
      data: {
        labels: [{ name: 'fleet' }],
        body: 'No fleet context here',
        milestone: { number: 1, title: 'Sprint 1' },
      },
      edges: [
        { relation: 'fixes', target: { kind: 'pr', id: '42' }, resolved: true },
      ],
    };

    const findings = scanItem(node, []);
    const sourceFindings = findings.filter((f) => f.type === 'issue:missing-source');
    expect(sourceFindings).toHaveLength(1);
    expect(sourceFindings[0].fixability).toBe('none');
  });

  it('detects undispatched fleet issue', () => {
    const node: GraphNode = {
      ref: { kind: 'issue', id: '10' },
      data: {
        labels: [{ name: 'fleet' }],
        body: '---\n**Fleet Context**\n- Source: `jules:session:s-1`',
        milestone: { number: 1 },
      },
      edges: [], // no linked PRs
    };

    const findings = scanItem(node, []);
    const undispatchedFindings = findings.filter((f) => f.type === 'issue:undispatched');
    expect(undispatchedFindings).toHaveLength(1);
  });

  it('detects missing fleet-merge-ready label on PR', () => {
    const node: GraphNode = {
      ref: { kind: 'pr', id: '42' },
      data: {
        labels: [],
        body: 'Fixes #10',
        milestone: null,
        headRef: 'jules/fix-issue-10/s-abc',
      },
      edges: [
        { relation: 'fixes', target: { kind: 'issue', id: '10' }, resolved: true },
      ],
    };

    const findings = scanItem(node, []);
    const labelFindings = findings.filter((f) => f.type === 'pr:missing-label');
    expect(labelFindings).toHaveLength(1);
    expect(labelFindings[0].fixability).toBe('deterministic');
  });

  it('detects orphaned PR on fleet/jules branch', () => {
    const node: GraphNode = {
      ref: { kind: 'pr', id: '42' },
      data: {
        labels: [],
        body: 'Some fix',
        headRef: 'fleet/fix-something',
        milestone: null,
      },
      edges: [], // no linked issues
    };

    const findings = scanItem(node, []);
    const orphanedFindings = findings.filter((f) => f.type === 'pr:orphaned');
    expect(orphanedFindings).toHaveLength(1);
  });

  it('detects broken links from unresolved edges', () => {
    const node: GraphNode = {
      ref: { kind: 'issue', id: '10' },
      data: { labels: [{ name: 'fleet' }], body: 'body', milestone: null },
      edges: [],
    };
    const unresolvedEdges: UnresolvedEdge[] = [
      {
        from: { kind: 'issue', id: '10' },
        expectedRelation: 'dispatched',
        reason: 'No Fleet Context footer in issue body',
      },
    ];

    const findings = scanItem(node, unresolvedEdges);
    const brokenLinks = findings.filter((f) => f.type === 'graph:broken-link');
    expect(brokenLinks).toHaveLength(1);
    expect(brokenLinks[0].detail).toContain('Fleet Context');
  });

  it('returns no findings for clean fleet issue', () => {
    const node: GraphNode = {
      ref: { kind: 'issue', id: '10' },
      data: {
        labels: [{ name: 'fleet' }],
        body: '---\n**Fleet Context**\n- Source: `jules:session:s-1`',
        milestone: { number: 1 },
      },
      edges: [
        { relation: 'fixes', target: { kind: 'pr', id: '42' }, resolved: true },
      ],
    };

    const findings = scanItem(node, []);
    expect(findings).toHaveLength(0);
  });

  it('skips scan for non-fleet issues', () => {
    const node: GraphNode = {
      ref: { kind: 'issue', id: '10' },
      data: {
        labels: [{ name: 'bug' }],
        body: 'A normal bug',
        milestone: null,
      },
      edges: [],
    };

    const findings = scanItem(node, []);
    expect(findings).toHaveLength(0);
  });
});

// ── listUndispatchedIssues ─────────────────────────────────────────

describe('listUndispatchedIssues', () => {
  it('returns fleet issues without open PRs', async () => {
    const octokit = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [
              { number: 10, title: 'Fix bug', labels: [{ name: 'fleet' }], milestone: null },
              { number: 20, title: 'Add feature', labels: [{ name: 'fleet' }], milestone: { title: 'Sprint 1' } },
            ],
          }),
        },
        pulls: {
          list: vi.fn().mockResolvedValue({
            data: [
              { number: 42, body: 'Fixes #20' },
            ],
          }),
        },
      },
    } as any;

    const result = await listUndispatchedIssues(octokit, 'owner', 'repo');
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(10);
  });

  it('excludes PRs from issue listing', async () => {
    const octokit = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [
              { number: 10, title: 'Fix bug', labels: [{ name: 'fleet' }], pull_request: {} },
            ],
          }),
        },
        pulls: {
          list: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
    } as any;

    const result = await listUndispatchedIssues(octokit, 'owner', 'repo');
    expect(result).toHaveLength(0);
  });
});

// ── Fix ops ────────────────────────────────────────────────────────

describe('addLabel', () => {
  it('calls issues.addLabels API', async () => {
    const addLabels = vi.fn().mockResolvedValue({});
    const octokit = { rest: { issues: { addLabels } } } as any;

    await addLabel(octokit, 'owner', 'repo', 42, 'fleet-merge-ready');
    expect(addLabels).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 42,
      labels: ['fleet-merge-ready'],
    });
  });
});

describe('assignMilestone', () => {
  it('calls issues.update API with milestone number', async () => {
    const update = vi.fn().mockResolvedValue({});
    const octokit = { rest: { issues: { update } } } as any;

    await assignMilestone(octokit, 'owner', 'repo', 42, 3);
    expect(update).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 42,
      milestone: 3,
    });
  });
});

describe('copyMilestone', () => {
  it('resolves milestone by title and assigns it', async () => {
    const update = vi.fn().mockResolvedValue({});
    const listMilestones = vi.fn().mockResolvedValue({
      data: [{ number: 3, title: 'Sprint 3' }],
    });
    const octokit = {
      rest: { issues: { listMilestones, update } },
    } as any;

    const result = await copyMilestone(octokit, 'owner', 'repo', 42, 'Sprint 3');
    expect(result).toBe(true);
    expect(update).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 42,
      milestone: 3,
    });
  });

  it('returns false when milestone not found', async () => {
    const listMilestones = vi.fn().mockResolvedValue({ data: [] });
    const octokit = {
      rest: { issues: { listMilestones } },
    } as any;

    const result = await copyMilestone(octokit, 'owner', 'repo', 42, 'Sprint 999');
    expect(result).toBe(false);
  });
});
