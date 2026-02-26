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

import type { Octokit } from 'octokit';
import type { DispatchInput, DispatchResult, DispatchSpec } from './spec.js';
import type { SessionDispatcher } from '../shared/session-dispatcher.js';
import type { FleetEmitter } from '../shared/events.js';
import { ok, fail } from '../shared/result/index.js';
import { getMilestoneContext } from '../analyze/milestone.js';
import { getDispatchStatus } from './status.js';
import { recordDispatch } from './events.js';

export interface DispatchHandlerDeps {
  octokit: Octokit;
  dispatcher: SessionDispatcher;
  emit?: FleetEmitter;
}

/**
 * DispatchHandler finds undispatched fleet issues in a milestone
 * and fires Jules worker sessions for each.
 * Never throws — all errors returned as Result.
 */
export class DispatchHandler implements DispatchSpec {
  private octokit: Octokit;
  private dispatcher: SessionDispatcher;
  private emit: FleetEmitter;

  constructor(deps: DispatchHandlerDeps) {
    this.octokit = deps.octokit;
    this.dispatcher = deps.dispatcher;
    this.emit = deps.emit ?? (() => { });
  }

  async execute(input: DispatchInput): Promise<DispatchResult> {
    try {
      this.emit({ type: 'dispatch:start', milestone: input.milestone });
      this.emit({ type: 'dispatch:scanning' });

      // 1. Get milestone context
      const ctx = await getMilestoneContext(this.octokit, {
        owner: input.owner,
        repo: input.repo,
        milestone: input.milestone,
      });

      // 2. Filter to fleet-labeled open issues
      const fleetIssues = ctx.issues.open.filter((issue) =>
        issue.labels.includes('fleet'),
      );

      if (fleetIssues.length === 0) {
        this.emit({ type: 'dispatch:done', dispatched: 0, skipped: 0 });
        return ok({ dispatched: [], skipped: 0 });
      }

      // 3. Get dispatch status for each issue
      const statuses = await getDispatchStatus(
        this.octokit,
        input.owner,
        input.repo,
        fleetIssues.map((i) => i.number),
      );

      // 4. Filter to undispatched issues
      const undispatched = statuses.filter(
        (s) => s.open && !s.dispatchEvent && s.linkedPRs.length === 0,
      );

      const skipped = statuses.length - undispatched.length;

      if (undispatched.length === 0) {
        this.emit({ type: 'dispatch:done', dispatched: 0, skipped });
        return ok({ dispatched: [], skipped });
      }

      this.emit({ type: 'dispatch:found', count: undispatched.length });

      const dispatched: Array<{ issueNumber: number; sessionId: string }> = [];

      for (const status of undispatched) {
        const issue = fleetIssues.find((i) => i.number === status.number)!;
        this.emit({
          type: 'dispatch:issue:dispatching',
          number: issue.number,
          title: issue.title,
        });

        const workerPrompt = `Fix Issue #${issue.number}: ${issue.title}

IMPORTANT: Your PR title MUST start with "Fixes #${issue.number}" and your PR description MUST include "Fixes #${issue.number}" on its own line so the issue is auto-closed on merge.

You are an autonomous execution agent. Implement the fix described below exactly as specified.

---

${issue.body}
`;

        try {
          const session = await this.dispatcher.dispatch({
            prompt: workerPrompt,
            source: {
              github: `${input.owner}/${input.repo}`,
              baseBranch: input.baseBranch,
            },
            requireApproval: false,
            autoPr: true,
          });

          // Record the dispatch event
          await recordDispatch(
            this.octokit,
            input.owner,
            input.repo,
            issue.number,
            session.id,
          );

          dispatched.push({
            issueNumber: issue.number,
            sessionId: session.id,
          });

          this.emit({
            type: 'dispatch:issue:dispatched',
            number: issue.number,
            sessionId: session.id,
          });
        } catch (error) {
          this.emit({
            type: 'error',
            code: 'DISPATCH_FAILED',
            message: `Failed to dispatch #${issue.number}: ${error instanceof Error ? error.message : error}`,
          });
        }
      }

      // Emit skipped issues
      for (const status of statuses) {
        if (!undispatched.includes(status)) {
          this.emit({
            type: 'dispatch:issue:skipped',
            number: status.number,
            reason: status.dispatchEvent ? 'already dispatched' : 'has linked PRs',
          });
        }
      }

      this.emit({
        type: 'dispatch:done',
        dispatched: dispatched.length,
        skipped,
      });

      return ok({ dispatched, skipped });
    } catch (error) {
      return fail(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }
  }
}
