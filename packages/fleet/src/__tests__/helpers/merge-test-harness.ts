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
 * Builder-pattern test harness for MergeHandler.
 *
 * Lets scenario tests declaratively configure per-PR behavior:
 *
 *   const { handler, events } = new MergeTestHarness()
 *     .withPRs([1, 2])
 *     .updateBranchResult(1, 'conflict')
 *     .updateBranchResult(2, 'ok')
 *     .ciResult(2, 'pass')
 *     .mergeResult(2, 'ok')
 *     .build();
 */

import { vi } from 'vitest';
import { MergeHandler } from '../../merge/handler.js';
import type { MergeInput } from '../../merge/spec.js';
import type { FleetEvent } from '../../shared/events.js';

// ── Types ────────────────────────────────────────────────────────────

type UpdateOutcome = 'ok' | 'conflict' | 'api-error';
type CIOutcome = 'pass' | 'fail' | 'timeout' | 'none';
type MergeOutcome = 'ok' | 'fail';

interface PRConfig {
  number: number;
  labels: string[];
  updateBranch: UpdateOutcome;
  ci: CIOutcome;
  merge: MergeOutcome;
  /** Files this PR touches (for overlap analysis) */
  files: string[];
}

// ── Default Input ────────────────────────────────────────────────────

export const BASE_INPUT: MergeInput = {
  mode: 'label',
  baseBranch: 'main',
  admin: false,
  redispatch: false,
  maxCIWaitSeconds: 1,
  maxRetries: 2,
  pollTimeoutSeconds: 1,
  owner: 'test-owner',
  repo: 'test-repo',
};

// ── Harness ──────────────────────────────────────────────────────────

export class MergeTestHarness {
  private prs: PRConfig[] = [];
  private julesSessionMock = vi.fn().mockResolvedValue({ id: 'mock-session-1' });

  /** Add PRs by number — all default to: update ok, CI pass, merge ok */
  withPRs(numbers: number[]): this {
    for (const n of numbers) {
      this.prs.push({
        number: n,
        labels: ['fleet-merge-ready'],
        updateBranch: 'ok',
        ci: 'none',    // no CI checks = auto-pass
        merge: 'ok',
        files: [`file-${n}.ts`],
      });
    }
    return this;
  }

  /** Override updateBranch result for a specific PR */
  updateBranchResult(prNumber: number, outcome: UpdateOutcome): this {
    this.getPR(prNumber).updateBranch = outcome;
    return this;
  }

  /** Override CI result for a specific PR */
  ciResult(prNumber: number, outcome: CIOutcome): this {
    this.getPR(prNumber).ci = outcome;
    return this;
  }

  /** Override merge result for a specific PR */
  mergeResult(prNumber: number, outcome: MergeOutcome): this {
    this.getPR(prNumber).merge = outcome;
    return this;
  }

  /** Set files touched by a PR (for overlap detection) */
  prFiles(prNumber: number, files: string[]): this {
    this.getPR(prNumber).files = files;
    return this;
  }

  /** Build the handler and return it with event log and mocks */
  build(): {
    handler: MergeHandler;
    events: FleetEvent[];
    mocks: {
      updateBranch: ReturnType<typeof vi.fn>;
      merge: ReturnType<typeof vi.fn>;
      pullsGet: ReturnType<typeof vi.fn>;
      pullsUpdate: ReturnType<typeof vi.fn>;
      julesSession: ReturnType<typeof vi.fn>;
      listComments: ReturnType<typeof vi.fn>;
    };
  } {
    const events: FleetEvent[] = [];
    const emit = (e: FleetEvent) => events.push(e);

    // Build per-PR mock behaviors
    const updateBranchMock = vi.fn().mockImplementation(({ pull_number }: { pull_number: number }) => {
      const pr = this.prs.find((p) => p.number === pull_number);
      if (!pr) return Promise.resolve({ data: {} });

      switch (pr.updateBranch) {
        case 'ok':
          return Promise.resolve({ data: {} });
        case 'conflict': {
          const err = new Error('Merge conflict') as any;
          err.status = 422;
          return Promise.reject(err);
        }
        case 'api-error': {
          const err = new Error('Server error') as any;
          err.status = 500;
          return Promise.reject(err);
        }
      }
    });

    const pullsGetMock = vi.fn().mockImplementation(({ pull_number }: { pull_number: number }) => {
      const pr = this.prs.find((p) => p.number === pull_number);
      if (!pr) return Promise.resolve({ data: { head: { sha: `sha-${pull_number}` }, mergeable: true } });

      // For conflict detection: mergeable = false when conflict
      const mergeable = pr.updateBranch !== 'conflict';
      return Promise.resolve({
        data: {
          head: { sha: `sha-${pull_number}` },
          mergeable,
          mergeable_state: mergeable ? 'clean' : 'dirty',
        },
      });
    });

    const mergeMock = vi.fn().mockImplementation(({ pull_number }: { pull_number: number }) => {
      const pr = this.prs.find((p) => p.number === pull_number);
      if (!pr || pr.merge === 'ok') return Promise.resolve({ data: {} });
      return Promise.reject(new Error('Merge failed'));
    });

    const pullsUpdateMock = vi.fn().mockResolvedValue({ data: {} });

    const checksListMock = vi.fn().mockImplementation(({ ref }: { ref: string }) => {
      // Find PR by SHA
      const pr = this.prs.find((p) => `sha-${p.number}` === ref);
      if (!pr) return Promise.resolve({ data: { check_runs: [] } });

      switch (pr.ci) {
        case 'none':
          return Promise.resolve({ data: { check_runs: [] } });
        case 'pass':
          return Promise.resolve({
            data: {
              check_runs: [{ name: 'CI', status: 'completed', conclusion: 'success' }],
            },
          });
        case 'fail':
          return Promise.resolve({
            data: {
              check_runs: [{ name: 'CI', status: 'completed', conclusion: 'failure' }],
            },
          });
        case 'timeout':
          // Return in_progress forever (the short maxCIWaitSeconds will time out)
          return Promise.resolve({
            data: {
              check_runs: [{ name: 'CI', status: 'in_progress', conclusion: null }],
            },
          });
      }
    });

    // Build file listing mock for planMergeOrder
    const pullsListFilesMock = vi.fn().mockImplementation(({ pull_number }: { pull_number: number }) => {
      const pr = this.prs.find((p) => p.number === pull_number);
      const files = pr?.files ?? [];
      return Promise.resolve({ data: files.map((f) => ({ filename: f })) });
    });

    const octokit = {
      rest: {
        pulls: {
          list: vi.fn().mockResolvedValue({
            data: this.prs.map((p) => ({
              number: p.number,
              head: { ref: `branch-${p.number}`, sha: `sha-${p.number}` },
              body: `PR #${p.number} body`,
              labels: p.labels.map((name) => ({ name })),
            })),
          }),
          get: pullsGetMock,
          merge: mergeMock,
          update: pullsUpdateMock,
          updateBranch: updateBranchMock,
          listFiles: pullsListFilesMock,
        },
        checks: {
          listForRef: checksListMock,
        },
        issues: {
          createComment: vi.fn().mockResolvedValue({ data: {} }),
          listComments: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
      graphql: vi.fn().mockResolvedValue({
        repository: {
          pullRequest: {
            closingIssuesReferences: { nodes: [] },
          },
        },
      }),
    } as any;

    // Mock the jules SDK module
    vi.doMock('@google/jules-sdk', () => ({
      jules: {
        session: this.julesSessionMock,
      },
    }));

    const handler = new MergeHandler({
      octokit,
      emit,
      sleep: async () => {},
    });

    return {
      handler,
      events,
      mocks: {
        updateBranch: updateBranchMock,
        merge: mergeMock,
        pullsGet: pullsGetMock,
        pullsUpdate: pullsUpdateMock,
        julesSession: this.julesSessionMock,
        listComments: octokit.rest.issues.listComments,
      },
    };
  }

  private getPR(prNumber: number): PRConfig {
    const pr = this.prs.find((p) => p.number === prNumber);
    if (!pr) throw new Error(`PR #${prNumber} not configured. Call withPRs() first.`);
    return pr;
  }
}
