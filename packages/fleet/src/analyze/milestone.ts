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

// ── Types ───────────────────────────────────────────────────────────

export interface MilestoneContextOptions {
  owner: string;
  repo: string;
  /** Milestone number. When omitted, fetches unmilestoned issues. */
  milestone?: string;
  /** How many days back to include closed issues (default: 14). */
  closedLookbackDays?: number;
}

export interface MilestoneIssue {
  number: number;
  title: string;
  state: string;
  labels: string[];
  body: string;
  createdAt: string;
  closedAt?: string;
}

export interface MilestonePullRequest {
  number: number;
  title: string;
  head: string;
  base: string;
  body: string;
}

export interface MilestoneContext {
  milestone?: { number: number; title: string };
  issues: {
    open: MilestoneIssue[];
    closed: MilestoneIssue[];
  };
  pullRequests: MilestonePullRequest[];
}

// ── Implementation ──────────────────────────────────────────────────

const IGNORE_LABEL = 'status: ignore';

function isTargetIssue(issue: any): boolean {
  if (issue.pull_request) return false;
  const hasIgnoreLabel = issue.labels?.some((label: any) => {
    const labelName = typeof label === 'string' ? label : label.name;
    return labelName === IGNORE_LABEL;
  });
  return !hasIgnoreLabel;
}

function toMilestoneIssue(raw: any): MilestoneIssue {
  return {
    number: raw.number,
    title: raw.title,
    state: raw.state,
    labels: (raw.labels ?? []).map((l: any) =>
      typeof l === 'string' ? l : l.name,
    ),
    body: raw.body ?? '',
    createdAt: raw.created_at,
    closedAt: raw.closed_at ?? undefined,
  };
}

function toPullRequest(raw: any): MilestonePullRequest {
  return {
    number: raw.number,
    title: raw.title,
    head: raw.head.ref,
    base: raw.base.ref,
    body: raw.body ?? '',
  };
}

/**
 * Returns structured data about a milestone's current state:
 * open issues, recently closed issues, and open pull requests.
 *
 * Takes Octokit as a parameter for testability.
 */
export async function getMilestoneContext(
  octokit: Octokit,
  options: MilestoneContextOptions,
): Promise<MilestoneContext> {
  const { owner, repo, milestone, closedLookbackDays = 14 } = options;

  let milestoneInfo: MilestoneContext['milestone'];

  if (milestone) {
    const { data } = await octokit.rest.issues.getMilestone({
      owner,
      repo,
      milestone_number: parseInt(milestone, 10),
    });
    milestoneInfo = { number: data.number, title: data.title };
  }

  const apiMilestoneFilter = milestone || 'none';

  const { data: openRaw } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: 'open',
    milestone: apiMilestoneFilter,
    per_page: 100,
  });

  const since = new Date();
  since.setDate(since.getDate() - closedLookbackDays);
  const { data: closedRaw } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: 'closed',
    milestone: apiMilestoneFilter,
    since: since.toISOString(),
    per_page: 100,
  });

  const { data: openPRs } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });

  return {
    milestone: milestoneInfo,
    issues: {
      open: openRaw.filter(isTargetIssue).map(toMilestoneIssue),
      closed: closedRaw.filter(isTargetIssue).map(toMilestoneIssue),
    },
    pullRequests: openPRs.map(toPullRequest),
  };
}
