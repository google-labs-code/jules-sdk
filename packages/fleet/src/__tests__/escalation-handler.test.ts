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
import { ConflictEscalationHandler } from '../merge/escalation/handler.js';

// ── Helpers ─────────────────────────────────────────────────────────

function createMockOctokit(overrides: {
  workflowRuns?: any[];
  checkRuns?: any[];
  prHeadSha?: string;
  prHeadRef?: string;
} = {}) {
  const sha = overrides.prHeadSha ?? 'abc123';
  const ref = overrides.prHeadRef ?? 'fix/some-branch';
  return {
    rest: {
      pulls: {
        get: vi.fn().mockResolvedValue({
          data: {
            head: { sha, ref },
            body: 'Original PR body',
          },
        }),
      },
      actions: {
        listWorkflowRuns: vi.fn().mockResolvedValue({
          data: {
            workflow_runs: overrides.workflowRuns ?? [],
          },
        }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: {
            check_runs: overrides.checkRuns ?? [],
          },
        }),
      },
    },
  } as any;
}

function createMockJulesFactory(sessionId = 'session-123') {
  const mockSession = vi.fn().mockResolvedValue({ id: sessionId });
  return {
    factory: { session: mockSession } as any,
    mockSession,
  };
}

function makeWorkflowRun(
  conclusion: 'failure' | 'success' | null,
  createdAt: string,
) {
  return { conclusion, created_at: createdAt };
}

function makeCheckRun(
  name: string,
  conclusion: 'failure' | 'success' | 'neutral',
  startedAt: string,
  outputText?: string,
) {
  return {
    name,
    conclusion,
    started_at: startedAt,
    output: outputText ? { text: outputText } : { text: null },
  };
}

const baseInput = {
  owner: 'google-labs-code',
  repo: 'jules-sdk',
  prNumber: 42,
  baseBranch: 'main',
  failureThreshold: 3,
};

// ── Tests ───────────────────────────────────────────────────────────

describe('ConflictEscalationHandler', () => {
  describe('countConflictFailures — uses workflow runs per branch', () => {
    it('returns BELOW_THRESHOLD when failures < threshold', async () => {
      const octokit = createMockOctokit({
        workflowRuns: [
          makeWorkflowRun('failure', '2026-03-01T01:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T00:00:00Z'),
        ],
      });
      const { factory } = createMockJulesFactory();
      const handler = new ConflictEscalationHandler(octokit, factory);

      const result = await handler.execute(baseInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BELOW_THRESHOLD');
        expect(result.error.message).toContain('2');
        expect(result.error.recoverable).toBe(true);
      }
    });

    it('returns ok when failures >= threshold (the 3rd failure triggers escalation)', async () => {
      const octokit = createMockOctokit({
        workflowRuns: [
          makeWorkflowRun('failure', '2026-03-01T02:00:00Z'), // 3rd push
          makeWorkflowRun('failure', '2026-03-01T01:00:00Z'), // 2nd push
          makeWorkflowRun('failure', '2026-03-01T00:00:00Z'), // 1st push
        ],
      });
      const { factory } = createMockJulesFactory('escalated-session-1');
      const handler = new ConflictEscalationHandler(octokit, factory);

      const result = await handler.execute(baseInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sessionId).toBe('escalated-session-1');
        expect(result.data.failureCount).toBe(3);
      }
    });

    it('returns ok when failures exceed threshold', async () => {
      const octokit = createMockOctokit({
        workflowRuns: [
          makeWorkflowRun('failure', '2026-03-01T04:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T03:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T02:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T01:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T00:00:00Z'),
        ],
      });
      const { factory } = createMockJulesFactory();
      const handler = new ConflictEscalationHandler(octokit, factory);

      const result = await handler.execute(baseInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.failureCount).toBe(5);
      }
    });

    it('returns NO_CONFLICT_RUNS when no workflow runs found', async () => {
      const octokit = createMockOctokit({ workflowRuns: [] });
      const { factory } = createMockJulesFactory();
      const handler = new ConflictEscalationHandler(octokit, factory);

      const result = await handler.execute(baseInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_CONFLICT_RUNS');
      }
    });

    it('only counts consecutive failures (stops at first success)', async () => {
      const octokit = createMockOctokit({
        workflowRuns: [
          makeWorkflowRun('failure', '2026-03-01T03:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T02:00:00Z'),
          makeWorkflowRun('success', '2026-03-01T01:00:00Z'), // breaks the streak
          makeWorkflowRun('failure', '2026-03-01T00:00:00Z'),
        ],
      });
      const { factory } = createMockJulesFactory();
      const handler = new ConflictEscalationHandler(octokit, factory);

      const result = await handler.execute(baseInput);

      // Only 2 consecutive failures (the success breaks the streak)
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BELOW_THRESHOLD');
        expect(result.error.message).toContain('2');
      }
    });

    it('regression: zero failures returns BELOW_THRESHOLD, not ok', async () => {
      const octokit = createMockOctokit({
        workflowRuns: [
          makeWorkflowRun('success', '2026-03-01T00:00:00Z'),
        ],
      });
      const { factory } = createMockJulesFactory();
      const handler = new ConflictEscalationHandler(octokit, factory);

      const result = await handler.execute(baseInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BELOW_THRESHOLD');
      }
    });
  });

  describe('API error handling', () => {
    it('returns CHECK_RUNS_API_ERROR when API throws', async () => {
      const octokit = createMockOctokit();
      octokit.rest.pulls.get.mockRejectedValue(new Error('API rate limit'));
      const { factory } = createMockJulesFactory();
      const handler = new ConflictEscalationHandler(octokit, factory);

      const result = await handler.execute(baseInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CHECK_RUNS_API_ERROR');
        expect(result.error.message).toContain('API rate limit');
      }
    });

    it('returns SESSION_DISPATCH_FAILED when Jules SDK throws', async () => {
      const octokit = createMockOctokit({
        workflowRuns: [
          makeWorkflowRun('failure', '2026-03-01T02:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T01:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T00:00:00Z'),
        ],
      });
      const julesObj = { session: vi.fn().mockRejectedValue(new Error('Invalid API key')) } as any;
      const handler = new ConflictEscalationHandler(octokit, julesObj);

      const result = await handler.execute(baseInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SESSION_DISPATCH_FAILED');
        expect(result.error.message).toContain('Invalid API key');
      }
    });
  });

  describe('session dispatch behavior', () => {
    it('dispatches session to the existing PR branch, not base', async () => {
      const octokit = createMockOctokit({
        workflowRuns: [
          makeWorkflowRun('failure', '2026-03-01T02:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T01:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T00:00:00Z'),
        ],
        prHeadRef: 'feat/my-feature',
      });
      const { factory, mockSession } = createMockJulesFactory();
      const handler = new ConflictEscalationHandler(octokit, factory);

      await handler.execute(baseInput);

      expect(mockSession).toHaveBeenCalledWith(
        expect.objectContaining({
          source: expect.objectContaining({
            baseBranch: 'feat/my-feature', // PR branch, not 'main'
          }),
          autoPr: false, // Don't create a new PR
        }),
      );
    });

    it('does NOT close the original PR', async () => {
      const octokit = createMockOctokit({
        workflowRuns: [
          makeWorkflowRun('failure', '2026-03-01T02:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T01:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T00:00:00Z'),
        ],
      });
      const { factory } = createMockJulesFactory();
      const handler = new ConflictEscalationHandler(octokit, factory);

      await handler.execute(baseInput);

      // There should be no 'update' method called at all
      expect(octokit.rest.pulls.update).toBeUndefined();
    });
  });

  describe('conflict output extraction', () => {
    it('extracts conflictFiles from check run output', async () => {
      const conflictJson = JSON.stringify({
        data: {
          affectedFiles: [
            { filePath: 'src/a.ts' },
            { filePath: 'src/b.ts' },
          ],
        },
      });
      const octokit = createMockOctokit({
        workflowRuns: [
          makeWorkflowRun('failure', '2026-03-01T02:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T01:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T00:00:00Z'),
        ],
        checkRuns: [
          makeCheckRun('check-conflicts', 'failure', '2026-03-01T02:00:00Z', conflictJson),
        ],
      });
      const { factory } = createMockJulesFactory();
      const handler = new ConflictEscalationHandler(octokit, factory);

      const result = await handler.execute(baseInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conflictFiles).toEqual(['src/a.ts', 'src/b.ts']);
      }
    });

    it('handles missing check run output gracefully', async () => {
      const octokit = createMockOctokit({
        workflowRuns: [
          makeWorkflowRun('failure', '2026-03-01T02:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T01:00:00Z'),
          makeWorkflowRun('failure', '2026-03-01T00:00:00Z'),
        ],
        checkRuns: [],
      });
      const { factory } = createMockJulesFactory();
      const handler = new ConflictEscalationHandler(octokit, factory);

      const result = await handler.execute(baseInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conflictFiles).toEqual([]);
      }
    });
  });
});
