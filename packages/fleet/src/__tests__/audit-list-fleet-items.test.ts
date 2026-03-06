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
import { listFleetItems } from '../audit/ops/list-fleet-items.js';
import type { NodeRef } from '../audit/graph/types.js';

// ── Contract: listFleetItems ──────────────────────────────────────

describe('listFleetItems', () => {
  function mockOctokit(issues: any[], pulls: any[]) {
    const paginate = vi.fn().mockImplementation((method: any) => {
      if (method === octokit.rest.issues.listForRepo) return Promise.resolve(issues);
      if (method === octokit.rest.pulls.list) return Promise.resolve(pulls);
      return Promise.resolve([]);
    });
    const octokit = {
      paginate,
      rest: {
        issues: { listForRepo: vi.fn() },
        pulls: { list: vi.fn() },
      },
    } as any;
    // Re-bind paginate after octokit is defined so method identity checks work
    octokit.paginate = vi.fn().mockImplementation((method: any) => {
      if (method === octokit.rest.issues.listForRepo) return Promise.resolve(issues);
      if (method === octokit.rest.pulls.list) return Promise.resolve(pulls);
      return Promise.resolve([]);
    });
    return octokit;
  }

  it('returns fleet issues as NodeRefs', async () => {
    const octokit = mockOctokit(
      [
        { number: 10, title: 'Fix bug', labels: [{ name: 'fleet' }] },
        { number: 20, title: 'Add feature', labels: [{ name: 'fleet' }] },
      ],
      [],
    );

    const refs = await listFleetItems(octokit, 'owner', 'repo');
    const issueRefs = refs.filter((r: NodeRef) => r.kind === 'issue');
    expect(issueRefs).toHaveLength(2);
    expect(issueRefs[0]).toEqual({ kind: 'issue', id: '10' });
    expect(issueRefs[1]).toEqual({ kind: 'issue', id: '20' });
  });

  it('returns all open PRs as NodeRefs', async () => {
    const octokit = mockOctokit(
      [],
      [
        { number: 42, head: { ref: 'fix-issue-6-client-123' } },
        { number: 43, head: { ref: 'jules-839378212306222412-a844f661' } },
        { number: 44, head: { ref: 'feature/unrelated' } },
      ],
    );

    const refs = await listFleetItems(octokit, 'owner', 'repo');
    const prRefs = refs.filter((r: NodeRef) => r.kind === 'pr');
    expect(prRefs).toHaveLength(3);
    expect(prRefs).toContainEqual({ kind: 'pr', id: '42' });
    expect(prRefs).toContainEqual({ kind: 'pr', id: '43' });
    expect(prRefs).toContainEqual({ kind: 'pr', id: '44' });
  });

  it('excludes pull_request entries from issue listing', async () => {
    const octokit = mockOctokit(
      [
        { number: 10, title: 'A real issue', labels: [{ name: 'fleet' }] },
        { number: 42, title: 'A PR', labels: [{ name: 'fleet' }], pull_request: {} },
      ],
      [],
    );

    const refs = await listFleetItems(octokit, 'owner', 'repo');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ kind: 'issue', id: '10' });
  });

  it('deduplicates when same PR appears multiple times', async () => {
    const octokit = mockOctokit(
      [{ number: 10, title: 'Issue', labels: [{ name: 'fleet' }] }],
      [
        { number: 42, head: { ref: 'fix-10' } },
        { number: 42, head: { ref: 'fix-10' } }, // duplicate in API response
      ],
    );

    const refs = await listFleetItems(octokit, 'owner', 'repo');
    const prRefs = refs.filter((r: NodeRef) => r.kind === 'pr');
    expect(prRefs).toHaveLength(1); // deduplicated
  });

  it('returns empty array for repo with no fleet items', async () => {
    const octokit = mockOctokit([], []);
    const refs = await listFleetItems(octokit, 'owner', 'repo');
    expect(refs).toEqual([]);
  });

  it('returns both issues and PRs in a combined result', async () => {
    const octokit = mockOctokit(
      [
        { number: 10, title: 'Fleet issue', labels: [{ name: 'fleet' }] },
      ],
      [
        { number: 42, head: { ref: 'fix-issue-10-abc123' } },
      ],
    );

    const refs = await listFleetItems(octokit, 'owner', 'repo');
    expect(refs).toHaveLength(2);
    expect(refs).toContainEqual({ kind: 'issue', id: '10' });
    expect(refs).toContainEqual({ kind: 'pr', id: '42' });
  });
});
