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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DispatchHandler } from '../dispatch/handler.js';
import type { SessionDispatcher } from '../shared/session-dispatcher.js';

function createMockOctokit(overrides: {
  openIssues?: any[];
  closedIssues?: any[];
  pullRequests?: any[];
  comments?: any[];
} = {}) {
  const { openIssues = [], closedIssues = [], pullRequests = [], comments = [] } = overrides;

  return {
    rest: {
      issues: {
        getMilestone: vi.fn().mockResolvedValue({
          data: { number: 1, title: 'Sprint 1' },
        }),
        listForRepo: vi.fn()
          .mockResolvedValueOnce({ data: openIssues })   // open
          .mockResolvedValueOnce({ data: closedIssues }), // closed
        get: vi.fn().mockImplementation(({ issue_number }: any) => ({
          data: openIssues.find((i: any) => i.number === issue_number) ?? {
            number: issue_number,
            state: 'open',
            labels: [],
          },
        })),
        listComments: vi.fn().mockResolvedValue({ data: comments }),
        createComment: vi.fn().mockResolvedValue({
          data: { id: 999 },
        }),
      },
      pulls: {
        list: vi.fn().mockResolvedValue({ data: pullRequests }),
      },
    },
  } as any;
}

function createMockDispatcher(): SessionDispatcher & { dispatch: ReturnType<typeof vi.fn> } {
  return {
    dispatch: vi.fn().mockResolvedValue({ id: 'session-xyz' }),
  };
}

describe('DispatchHandler', () => {
  const noop = () => {};

  it('returns empty result when no fleet issues', async () => {
    const octokit = createMockOctokit({ openIssues: [] });
    const dispatcher = createMockDispatcher();
    const handler = new DispatchHandler({ octokit, dispatcher });

    const result = await handler.execute({
      milestone: '1',
      owner: 'o',
      repo: 'r',
      baseBranch: 'main',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dispatched).toHaveLength(0);
      expect(result.data.skipped).toBe(0);
    }
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches undispatched fleet issues', async () => {
    const octokit = createMockOctokit({
      openIssues: [
        {
          number: 10,
          title: 'Fix bug',
          state: 'open',
          labels: [{ name: 'fleet' }],
          body: 'Fix the bug.',
          created_at: '2026-01-01',
        },
      ],
    });
    const dispatcher = createMockDispatcher();
    const handler = new DispatchHandler({ octokit, dispatcher });

    const result = await handler.execute({
      milestone: '1',
      owner: 'o',
      repo: 'r',
      baseBranch: 'main',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dispatched).toHaveLength(1);
      expect(result.data.dispatched[0].issueNumber).toBe(10);
      expect(result.data.dispatched[0].sessionId).toBe('session-xyz');
    }
    expect(dispatcher.dispatch).toHaveBeenCalledOnce();
  });

  it('skips already-dispatched issues', async () => {
    const octokit = createMockOctokit({
      openIssues: [
        {
          number: 10,
          title: 'Fix bug',
          state: 'open',
          labels: [{ name: 'fleet' }],
          body: 'Fix the bug.',
          created_at: '2026-01-01',
        },
      ],
      comments: [
        {
          body: '🤖 **Fleet Dispatch Event**\nSession: `session-old`\nTimestamp: 2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
          id: 123,
        },
      ],
    });
    const dispatcher = createMockDispatcher();
    const handler = new DispatchHandler({ octokit, dispatcher });

    const result = await handler.execute({
      milestone: '1',
      owner: 'o',
      repo: 'r',
      baseBranch: 'main',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dispatched).toHaveLength(0);
      expect(result.data.skipped).toBe(1);
    }
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('handles dispatcher failure per-issue without failing the batch', async () => {
    const octokit = createMockOctokit({
      openIssues: [
        {
          number: 10,
          title: 'Fix bug',
          state: 'open',
          labels: [{ name: 'fleet' }],
          body: 'Fix the bug.',
          created_at: '2026-01-01',
        },
        {
          number: 11,
          title: 'Fix another bug',
          state: 'open',
          labels: [{ name: 'fleet' }],
          body: 'Fix the other bug.',
          created_at: '2026-01-02',
        },
      ],
    });

    const dispatcher: SessionDispatcher = {
      dispatch: vi.fn()
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({ id: 'session-ok' }),
    };

    const handler = new DispatchHandler({ octokit, dispatcher });
    const result = await handler.execute({
      milestone: '1',
      owner: 'o',
      repo: 'r',
      baseBranch: 'main',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // First issue failed, second succeeded
      expect(result.data.dispatched).toHaveLength(1);
      expect(result.data.dispatched[0].issueNumber).toBe(11);
    }
  });
});
