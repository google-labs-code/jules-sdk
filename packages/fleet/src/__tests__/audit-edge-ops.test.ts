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
import { resolvePRToIssues } from '../audit/ops/resolve-pr-to-issues.js';
import { resolveIssueToPRs } from '../audit/ops/resolve-issue-to-prs.js';
import { resolveIssueToSession } from '../audit/ops/resolve-issue-to-session.js';
import { resolvePRToSession } from '../audit/ops/resolve-pr-to-session.js';
import { resolveSessionToPR } from '../audit/ops/resolve-session-to-pr.js';
import { resolvePRToChecks } from '../audit/ops/resolve-pr-to-checks.js';
import { resolveMilestoneToItems } from '../audit/ops/resolve-milestone-to-items.js';

// ── resolvePRToIssues ──────────────────────────────────────────────

describe('resolvePRToIssues', () => {
  it('returns linked issue refs from GraphQL', async () => {
    const octokit = {
      graphql: vi.fn().mockResolvedValue({
        repository: {
          pullRequest: {
            closingIssuesReferences: {
              nodes: [{ number: 10 }, { number: 20 }],
            },
          },
        },
      }),
    } as any;

    const refs = await resolvePRToIssues(octokit, 'owner', 'repo', 42);
    expect(refs).toEqual([
      { kind: 'issue', id: '10' },
      { kind: 'issue', id: '20' },
    ]);
  });

  it('returns empty array when no linked issues', async () => {
    const octokit = {
      graphql: vi.fn().mockResolvedValue({
        repository: {
          pullRequest: {
            closingIssuesReferences: { nodes: [] },
          },
        },
      }),
    } as any;

    const refs = await resolvePRToIssues(octokit, 'owner', 'repo', 42);
    expect(refs).toEqual([]);
  });
});

// ── resolveIssueToPRs ──────────────────────────────────────────────

describe('resolveIssueToPRs', () => {
  it('finds PRs from cross-referenced timeline events', async () => {
    const octokit = {
      rest: {
        issues: {
          listEventsForTimeline: vi.fn().mockResolvedValue({
            data: [
              {
                event: 'cross-referenced',
                source: { issue: { number: 55, pull_request: {} } },
              },
              {
                event: 'cross-referenced',
                source: { issue: { number: 66, pull_request: {} } },
              },
              { event: 'labeled' }, // non-cross-ref event
            ],
          }),
        },
      },
    } as any;

    const refs = await resolveIssueToPRs(octokit, 'owner', 'repo', 10);
    expect(refs).toEqual([
      { kind: 'pr', id: '55' },
      { kind: 'pr', id: '66' },
    ]);
  });

  it('deduplicates PRs', async () => {
    const octokit = {
      rest: {
        issues: {
          listEventsForTimeline: vi.fn().mockResolvedValue({
            data: [
              {
                event: 'cross-referenced',
                source: { issue: { number: 55, pull_request: {} } },
              },
              {
                event: 'cross-referenced',
                source: { issue: { number: 55, pull_request: {} } },
              },
            ],
          }),
        },
      },
    } as any;

    const refs = await resolveIssueToPRs(octokit, 'owner', 'repo', 10);
    expect(refs).toHaveLength(1);
  });
});

// ── resolveIssueToSession ──────────────────────────────────────────

describe('resolveIssueToSession', () => {
  it('extracts session ref from Fleet Context footer', () => {
    const body = `Some issue body\n\n---\n**Fleet Context**\n- Source: \`jules:session:s-abc123\`\n- Link: https://jules.google.com/session/s-abc123`;
    const ref = resolveIssueToSession(body);
    expect(ref).toEqual({ kind: 'session', id: 's-abc123' });
  });

  it('returns null when no Fleet Context footer', () => {
    const body = 'Just a regular issue body';
    const ref = resolveIssueToSession(body);
    expect(ref).toBeNull();
  });

  it('handles source ref with colons in ID', () => {
    const body = `---\n**Fleet Context**\n- Source: \`jules:session:s-abc:123\``;
    const ref = resolveIssueToSession(body);
    expect(ref).toEqual({ kind: 'session', id: 's-abc:123' });
  });

  it('returns null for non-session source refs', () => {
    const body = `---\n**Fleet Context**\n- Source: \`github:run:12345\``;
    const ref = resolveIssueToSession(body);
    expect(ref).toBeNull();
  });
});

// ── resolvePRToSession ─────────────────────────────────────────────

describe('resolvePRToSession', () => {
  it('extracts session ID from branch name', () => {
    const ref = resolvePRToSession('', 'jules/fix-issue-42/s-abc123');
    expect(ref).toEqual({ kind: 'session', id: 's-abc123' });
  });

  it('extracts session ID from jules.google.com link in body', () => {
    const body = 'Created by https://jules.google.com/session/s-xyz789';
    const ref = resolvePRToSession(body, 'some-branch');
    expect(ref).toEqual({ kind: 'session', id: 's-xyz789' });
  });

  it('extracts session ID from Fleet Context footer in body', () => {
    const body = 'PR body\n\n---\n**Fleet Context**\n- Source: `jules:session:s-def456`';
    const ref = resolvePRToSession(body, 'some-branch');
    expect(ref).toEqual({ kind: 'session', id: 's-def456' });
  });

  it('returns null when no session found', () => {
    const ref = resolvePRToSession('Regular PR', 'feature/my-change');
    expect(ref).toBeNull();
  });

  it('prefers branch name over body', () => {
    const body = 'Source: jules:session:s-from-body';
    const ref = resolvePRToSession(body, 'jules/fix/s-from-branch');
    expect(ref).toEqual({ kind: 'session', id: 's-from-branch' });
  });
});

// ── resolveSessionToPR ─────────────────────────────────────────────

describe('resolveSessionToPR', () => {
  it('returns PR ref from session state', () => {
    const ref = resolveSessionToPR({ pr: { number: 42 } });
    expect(ref).toEqual({ kind: 'pr', id: '42' });
  });

  it('returns null when no PR in session state', () => {
    const ref = resolveSessionToPR({ pr: null });
    expect(ref).toBeNull();
  });

  it('returns null when pr field is absent', () => {
    const ref = resolveSessionToPR({});
    expect(ref).toBeNull();
  });
});

// ── resolvePRToChecks ──────────────────────────────────────────────

describe('resolvePRToChecks', () => {
  it('returns check run refs', async () => {
    const octokit = {
      rest: {
        checks: {
          listForRef: vi.fn().mockResolvedValue({
            data: {
              check_runs: [
                { id: 111 },
                { id: 222 },
              ],
            },
          }),
        },
      },
    } as any;

    const refs = await resolvePRToChecks(octokit, 'owner', 'repo', 'sha123');
    expect(refs).toEqual([
      { kind: 'check-run', id: '111' },
      { kind: 'check-run', id: '222' },
    ]);
  });
});

// ── resolveMilestoneToItems ────────────────────────────────────────

describe('resolveMilestoneToItems', () => {
  it('returns issue and PR refs for a milestone', async () => {
    const octokit = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [
              { number: 10 },          // issue (no pull_request)
              { number: 20, pull_request: {} },  // PR
              { number: 30 },          // issue
            ],
          }),
        },
      },
    } as any;

    const refs = await resolveMilestoneToItems(octokit, 'owner', 'repo', 1);
    expect(refs).toEqual([
      { kind: 'issue', id: '10' },
      { kind: 'pr', id: '20' },
      { kind: 'issue', id: '30' },
    ]);
  });
});
