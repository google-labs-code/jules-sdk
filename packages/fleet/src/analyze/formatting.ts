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

import type { MilestoneIssue } from './milestone.js';

/**
 * Renders a MilestoneIssue into a rich markdown block suitable for prompt injection.
 */
export function toIssueMarkdown(issue: MilestoneIssue): string {
  const lines = [
    `## #${issue.number}: ${issue.title}`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **State** | ${issue.state}${issue.closedAt ? ` (closed ${issue.closedAt})` : ''} |`,
    `| **Labels** | ${issue.labels.map((l) => `\`${l}\``).join(', ') || 'none'} |`,
    `| **Created** | ${issue.createdAt} |`,
  ];

  if (issue.closedAt) {
    lines.push(`| **Closed** | ${issue.closedAt} |`);
  }

  lines.push(``);

  if (issue.body) {
    lines.push(`### Description`, ``, issue.body.trim(), ``);
  }

  lines.push(`---`, ``);
  return lines.join('\n');
}

/**
 * One-liner summary for compact prompt injection.
 */
export function toIssueLean(issue: MilestoneIssue): string {
  return `- #${issue.number}: ${issue.title} [${issue.state}]`;
}

/**
 * Format PR context with issue links extracted from body.
 */
export function formatPRContext(pr: {
  number: number;
  title: string;
  body?: string | null;
  head?: string;
  base?: string;
}): string {
  const fixesPattern = /(?:fixes|closes|resolves)\s+#(\d+)/gi;
  const linkedIssues: string[] = [];
  let match;
  while ((match = fixesPattern.exec(pr.body || '')) !== null) {
    linkedIssues.push(`#${match[1]}`);
  }
  const links =
    linkedIssues.length > 0 ? ` → Fixes ${linkedIssues.join(', ')}` : '';
  return `- PR #${pr.number}: ${pr.title}${links}\n  Head: ${pr.head || '?'} → Base: ${pr.base || '?'}\n`;
}
