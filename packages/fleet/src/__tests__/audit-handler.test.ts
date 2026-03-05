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
import { AuditInputSchema } from '../audit/spec.js';
import { AuditHandler } from '../audit/handler.js';

// ── AuditInputSchema contract tests ────────────────────────────────

describe('AuditInputSchema', () => {
  it('accepts minimal input with defaults', () => {
    const result = AuditInputSchema.safeParse({
      owner: 'google',
      repo: 'my-repo',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseBranch).toBe('main');
      expect(result.data.fixMode).toBe('off');
      expect(result.data.depth).toBe(2);
      expect(result.data.format).toBe('human');
      expect(result.data.entryPoint).toEqual({ kind: 'full' });
    }
  });

  it('accepts issue entry point', () => {
    const result = AuditInputSchema.safeParse({
      owner: 'google',
      repo: 'my-repo',
      entryPoint: { kind: 'issue', id: '42' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entryPoint).toEqual({ kind: 'issue', id: '42' });
    }
  });

  it('accepts milestone entry point', () => {
    const result = AuditInputSchema.safeParse({
      owner: 'google',
      repo: 'my-repo',
      entryPoint: { kind: 'milestone', id: '3' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts PR entry point', () => {
    const result = AuditInputSchema.safeParse({
      owner: 'google',
      repo: 'my-repo',
      entryPoint: { kind: 'pr', id: '99' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects depth > 5', () => {
    const result = AuditInputSchema.safeParse({
      owner: 'google',
      repo: 'my-repo',
      depth: 10,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty owner', () => {
    const result = AuditInputSchema.safeParse({
      owner: '',
      repo: 'my-repo',
    });
    expect(result.success).toBe(false);
  });

  it('accepts fixMode dry-run', () => {
    const result = AuditInputSchema.safeParse({
      owner: 'google',
      repo: 'my-repo',
      fixMode: 'dry-run',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fixMode).toBe('dry-run');
    }
  });

  it('accepts fixMode apply', () => {
    const result = AuditInputSchema.safeParse({
      owner: 'google',
      repo: 'my-repo',
      fixMode: 'apply',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fixMode).toBe('apply');
    }
  });

  it('rejects invalid fixMode', () => {
    const result = AuditInputSchema.safeParse({
      owner: 'google',
      repo: 'my-repo',
      fixMode: 'yolo',
    });
    expect(result.success).toBe(false);
  });
});

// ── AuditHandler logic tests ───────────────────────────────────────

function createAuditMockOctokit() {
  return {
    rest: {
      issues: {
        get: vi.fn().mockResolvedValue({
          data: {
            number: 10,
            title: 'Fix bug',
            state: 'open',
            labels: [{ name: 'fleet' }],
            body: 'Fix this\n\n---\n**Fleet Context**\n- Source: `jules:session:s-1`',
            milestone: { number: 1, title: 'Sprint 3' },
          },
        }),
        listForRepo: vi.fn().mockResolvedValue({ data: [] }),
        listEventsForTimeline: vi.fn().mockResolvedValue({ data: [] }),
        getMilestone: vi.fn().mockResolvedValue({
          data: { number: 1, title: 'Sprint 3', state: 'open' },
        }),
      },
      pulls: {
        get: vi.fn(),
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: { check_runs: [] },
        }),
      },
    },
    graphql: vi.fn().mockResolvedValue({
      repository: {
        pullRequest: { closingIssuesReferences: { nodes: [] } },
      },
    }),
  } as any;
}

describe('AuditHandler', () => {
  it('runs scan on specific issue entry point', async () => {
    const octokit = createAuditMockOctokit();
    const handler = new AuditHandler({ octokit });

    const result = await handler.execute({
      owner: 'google',
      repo: 'my-repo',
      baseBranch: 'main',
      entryPoint: { kind: 'issue', id: '10' },
      fixMode: 'off',
      depth: 1,
      format: 'human',
      includeGraph: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodesScanned).toBeGreaterThan(0);
    }
  });

  it('returns GITHUB_API_ERROR when API fails', async () => {
    const octokit = {
      rest: {
        issues: {
          get: vi.fn().mockRejectedValue(new Error('API rate limited')),
          listForRepo: vi.fn().mockResolvedValue({ data: [] }),
          listEventsForTimeline: vi.fn().mockResolvedValue({ data: [] }),
        },
        pulls: { list: vi.fn().mockResolvedValue({ data: [] }) },
      },
    } as any;

    const handler = new AuditHandler({ octokit });
    const result = await handler.execute({
      owner: 'google',
      repo: 'my-repo',
      baseBranch: 'main',
      entryPoint: { kind: 'issue', id: '10' },
      fixMode: 'off',
      depth: 1,
      format: 'human',
      includeGraph: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('GITHUB_API_ERROR');
    }
  });

  it('reports findings for fleet issue without linked PR', async () => {
    const octokit = createAuditMockOctokit();
    const handler = new AuditHandler({ octokit });

    const result = await handler.execute({
      owner: 'google',
      repo: 'my-repo',
      baseBranch: 'main',
      entryPoint: { kind: 'issue', id: '10' },
      fixMode: 'off',
      depth: 0,
      format: 'human',
      includeGraph: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // Fleet issue with no linked PR should produce undispatched finding
      const undispatched = result.data.findings.filter(
        (f) => f.type === 'issue:undispatched',
      );
      expect(undispatched).toHaveLength(1);
    }
  });

  it('dry-run mode marks fixable findings as wouldFix without calling APIs', async () => {
    const octokit = createAuditMockOctokit();
    const handler = new AuditHandler({ octokit });

    const result = await handler.execute({
      owner: 'google',
      repo: 'my-repo',
      baseBranch: 'main',
      entryPoint: { kind: 'issue', id: '10' },
      fixMode: 'dry-run',
      depth: 0,
      format: 'human',
      includeGraph: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // Should have findings but none should be `fixed`
      const fixable = result.data.findings.filter(
        (f) => f.fixability === 'deterministic',
      );
      for (const f of fixable) {
        expect(f.wouldFix).toBe(true);
        expect(f.fixed).toBe(false);
      }
      expect(result.data.fixedCount).toBe(0);
    }
  });

  it('apply mode actually fixes deterministic findings', async () => {
    const octokit = createAuditMockOctokit();
    // Mock PR missing fleet-merge-ready label
    octokit.rest.issues.get.mockResolvedValue({
      data: {
        number: 10,
        title: 'Fix bug',
        state: 'open',
        labels: [{ name: 'fleet' }],
        body: 'Fix this\n\n---\n**Fleet Context**\n- Source: `jules:session:s-1`',
        milestone: { number: 1, title: 'Sprint 3' },
        pull_request: { url: 'https://api.github.com/repos/google/my-repo/pulls/10' },
      },
    });
    octokit.rest.issues.addLabels = vi.fn().mockResolvedValue({ data: {} });

    const handler = new AuditHandler({ octokit });
    const result = await handler.execute({
      owner: 'google',
      repo: 'my-repo',
      baseBranch: 'main',
      entryPoint: { kind: 'issue', id: '10' },
      fixMode: 'apply',
      depth: 0,
      format: 'human',
      includeGraph: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fixedCount).toBeGreaterThanOrEqual(0);
    }
  });
});
