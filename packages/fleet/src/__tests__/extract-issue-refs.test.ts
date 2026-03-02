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
import { getClosingIssueRefs } from '../merge/ops/extract-issue-refs.js';

function createMockOctokit(nodes: Array<{ number: number }>, shouldFail = false) {
  return {
    graphql: vi.fn().mockImplementation(() => {
      if (shouldFail) throw new Error('GraphQL error');
      return Promise.resolve({
        repository: {
          pullRequest: {
            closingIssuesReferences: { nodes },
          },
        },
      });
    }),
  } as any;
}

describe('getClosingIssueRefs', () => {
  it('returns issue numbers from GraphQL response', async () => {
    const octokit = createMockOctokit([{ number: 42 }, { number: 7 }]);
    const result = await getClosingIssueRefs(octokit, 'owner', 'repo', 1);
    expect(result).toEqual([7, 42]); // sorted
  });

  it('returns empty array when no closing issues', async () => {
    const octokit = createMockOctokit([]);
    const result = await getClosingIssueRefs(octokit, 'owner', 'repo', 1);
    expect(result).toEqual([]);
  });

  it('returns empty array on GraphQL failure (non-fatal)', async () => {
    const octokit = createMockOctokit([], true);
    const result = await getClosingIssueRefs(octokit, 'owner', 'repo', 1);
    expect(result).toEqual([]);
  });

  it('passes correct variables to GraphQL query', async () => {
    const octokit = createMockOctokit([{ number: 1 }]);
    await getClosingIssueRefs(octokit, 'myorg', 'myrepo', 55);

    expect(octokit.graphql).toHaveBeenCalledWith(
      expect.stringContaining('closingIssuesReferences'),
      { owner: 'myorg', repo: 'myrepo', pr: 55 },
    );
  });

  it('sorts results ascending', async () => {
    const octokit = createMockOctokit([
      { number: 99 }, { number: 1 }, { number: 50 },
    ]);
    const result = await getClosingIssueRefs(octokit, 'owner', 'repo', 1);
    expect(result).toEqual([1, 50, 99]);
  });

  it('handles single issue', async () => {
    const octokit = createMockOctokit([{ number: 43 }]);
    const result = await getClosingIssueRefs(octokit, 'owner', 'repo', 59);
    expect(result).toEqual([43]);
  });
});
