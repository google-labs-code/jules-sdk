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
import type {
  TraceInput,
  TraceResult,
  TraceSpec,
  SessionTrace,
  TraceEvent,
  TraceScores,
  TraceData,
} from './spec.js';
import { ok, fail } from '../shared/result/index.js';
import { getDispatchStatus } from '../dispatch/status.js';
import { computeScores, aggregateScores } from './scoring.js';

export interface TraceHandlerDeps {
  octokit: Octokit;
}

/**
 * TraceHandler resolves the full correlation chain for fleet runs.
 * Entry points: session ID, issue number, or milestone.
 * Never throws — all errors returned as Result.
 */
export class TraceHandler implements TraceSpec {
  private octokit: Octokit;

  constructor(deps: TraceHandlerDeps) {
    this.octokit = deps.octokit;
  }

  async execute(input: TraceInput): Promise<TraceResult> {
    const [owner, repo] = input.repo.split('/');
    const environment = process.env.GITHUB_ACTIONS ? 'ci' as const : 'local' as const;

    try {
      if (input.sessionId) {
        return this.traceBySession(owner, repo, input.sessionId, environment);
      }
      if (input.issueNumber) {
        return this.traceByIssue(owner, repo, input.issueNumber, environment);
      }
      if (input.milestone) {
        return this.traceByMilestone(owner, repo, input.milestone, environment);
      }

      return fail('UNKNOWN_ERROR', 'No entry point provided', true);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Not Found')) {
        return fail('GITHUB_API_ERROR', error.message, true, 'Check owner/repo and permissions');
      }
      return fail(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }
  }

  // ── Entry Point: Session ───────────────────────────────────────────

  private async traceBySession(
    owner: string,
    repo: string,
    sessionId: string,
    environment: 'local' | 'ci',
  ): Promise<TraceResult> {
    // Find PR created by this session (Jules branch naming: jules-*-<sessionId>)
    const pr = await this.findPRForSession(owner, repo, sessionId);

    // Find the dispatching issue by checking all issues for dispatch events
    const dispatchInfo = await this.findDispatchForSession(owner, repo, sessionId);

    const events: TraceEvent[] = [];

    if (dispatchInfo) {
      events.push({
        timestamp: dispatchInfo.timestamp,
        type: 'dispatched',
        description: `Dispatched from issue #${dispatchInfo.issueNumber}`,
        actor: 'fleet',
      });
    }

    if (pr) {
      events.push({
        timestamp: pr.created_at,
        type: 'pr_created',
        description: `PR #${pr.number}: ${pr.title}`,
        actor: 'jules',
      });

      if (pr.merged_at) {
        events.push({
          timestamp: pr.merged_at,
          type: 'pr_merged',
          description: `PR #${pr.number} merged`,
          actor: 'github',
        });
      }
    }

    const sessionTrace: SessionTrace = {
      sessionId,
      dispatchedBy: dispatchInfo
        ? { issueNumber: dispatchInfo.issueNumber, issueTitle: dispatchInfo.issueTitle }
        : null,
      pullRequest: pr
        ? {
          number: pr.number,
          title: pr.title,
          state: pr.state,
          merged: !!pr.merged_at,
        }
        : null,
      changedFiles: pr ? await this.getPRFiles(owner, repo, pr.number) : [],
      events,
      environment,
    };

    const scores = computeScores(sessionTrace);

    return ok({
      entryPoint: 'session',
      repo: `${owner}/${repo}`,
      sessions: [sessionTrace],
      scores,
      generatedAt: new Date().toISOString(),
    });
  }

  // ── Entry Point: Issue ─────────────────────────────────────────────

  private async traceByIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    environment: 'local' | 'ci',
  ): Promise<TraceResult> {
    // Get dispatch status for this issue
    const [status] = await getDispatchStatus(
      this.octokit,
      owner,
      repo,
      [issueNumber],
    );

    if (!status) {
      return fail(
        'ISSUE_NOT_FOUND',
        `Issue #${issueNumber} not found or has no dispatch event`,
        true,
      );
    }

    const sessions: SessionTrace[] = [];

    if (status.dispatchEvent) {
      // Trace the session from the dispatch event
      const sessionResult = await this.traceBySession(
        owner,
        repo,
        status.dispatchEvent.sessionId,
        environment,
      );
      if (sessionResult.success) {
        sessions.push(...sessionResult.data.sessions);
      }
    }

    // Also check for linked PRs that may have come from redispatch
    for (const prNumber of status.linkedPRs) {
      const sessionId = await this.extractSessionIdFromPR(owner, repo, prNumber);
      if (sessionId && !sessions.some((s) => s.sessionId === sessionId)) {
        const sessionResult = await this.traceBySession(
          owner,
          repo,
          sessionId,
          environment,
        );
        if (sessionResult.success) {
          sessions.push(...sessionResult.data.sessions);
        }
      }
    }

    return ok({
      entryPoint: 'issue',
      repo: `${owner}/${repo}`,
      sessions,
      scores: sessions.length > 0 ? computeScores(sessions[0]) : null,
      generatedAt: new Date().toISOString(),
    });
  }

  // ── Entry Point: Milestone ─────────────────────────────────────────

  private async traceByMilestone(
    owner: string,
    repo: string,
    milestoneId: string,
    environment: 'local' | 'ci',
  ): Promise<TraceResult> {
    // Find all issues in the milestone
    const milestones = await this.octokit.rest.issues.listMilestones({
      owner,
      repo,
      state: 'all',
    });

    const milestone = milestones.data.find(
      (m) => m.number.toString() === milestoneId || m.title === milestoneId,
    );

    if (!milestone) {
      return fail(
        'MILESTONE_NOT_FOUND',
        `Milestone "${milestoneId}" not found`,
        true,
      );
    }

    const issues = await this.octokit.rest.issues.listForRepo({
      owner,
      repo,
      milestone: milestone.number.toString(),
      state: 'all',
      per_page: 100,
    });

    // Filter to actual issues (not PRs)
    const issueNumbers = issues.data
      .filter((i) => !i.pull_request)
      .map((i) => i.number);

    if (issueNumbers.length === 0) {
      return ok({
        entryPoint: 'milestone',
        repo: `${owner}/${repo}`,
        sessions: [],
        scores: null,
        generatedAt: new Date().toISOString(),
      });
    }

    // Get dispatch status for all issues
    const statuses = await getDispatchStatus(this.octokit, owner, repo, issueNumbers);

    const sessions: SessionTrace[] = [];
    for (const status of statuses) {
      if (status.dispatchEvent) {
        const result = await this.traceBySession(
          owner,
          repo,
          status.dispatchEvent.sessionId,
          environment,
        );
        if (result.success) {
          sessions.push(...result.data.sessions);
        }
      }
    }

    return ok({
      entryPoint: 'milestone',
      repo: `${owner}/${repo}`,
      sessions,
      scores: sessions.length > 0 ? aggregateScores(sessions) : null,
      generatedAt: new Date().toISOString(),
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private async findPRForSession(
    owner: string,
    repo: string,
    sessionId: string,
  ) {
    // Jules branches contain the session ID
    const { data: prs } = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state: 'all',
      per_page: 100,
    });

    return prs.find((pr) => pr.head.ref.includes(sessionId)) ?? null;
  }

  private async findDispatchForSession(
    owner: string,
    repo: string,
    sessionId: string,
  ): Promise<{ issueNumber: number; issueTitle: string; timestamp: string } | null> {
    // Search issues for dispatch event comments containing this session ID
    const { data: issues } = await this.octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'all',
      labels: 'fleet',
      per_page: 100,
    });

    for (const issue of issues) {
      if (issue.pull_request) continue;

      const { data: comments } = await this.octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: issue.number,
        per_page: 100,
      });

      for (const comment of comments) {
        if (
          comment.body?.includes('🤖 **Fleet Dispatch Event**') &&
          comment.body?.includes(sessionId)
        ) {
          return {
            issueNumber: issue.number,
            issueTitle: issue.title,
            timestamp: comment.created_at,
          };
        }
      }
    }

    return null;
  }

  private async extractSessionIdFromPR(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<string | null> {
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Jules branches: jules-<description>-<sessionId>
    const parts = pr.head.ref.split('-');
    return parts.length > 1 ? parts[parts.length - 1] : null;
  }

  private async getPRFiles(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<string[]> {
    try {
      const { data: files } = await this.octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      });
      return files.map((f) => f.filename);
    } catch {
      return [];
    }
  }

}
