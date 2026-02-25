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

import { getIssues } from './issues.js';
import { getGitRepoInfo } from './git.js';

type Issue = Awaited<ReturnType<typeof getIssues>>[number];

function toIssueMarkdown(issue: Issue): string {
  const labels = issue.labels
    .map((l) => (typeof l === 'string' ? l : l.name))
    .filter(Boolean);
  const assignees = (issue.assignees ?? []).map((a) => a.login);
  const reactions = issue.reactions;

  const lines = [
    `## #${issue.number}: ${issue.title}`,
    ``,
    `🔗 ${issue.html_url}`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Author** | ${issue.user?.login ?? 'unknown'} |`,
    `| **Association** | ${issue.author_association} |`,
    `| **State** | ${issue.state}${issue.state_reason ? ` (${issue.state_reason})` : ''} |`,
    `| **Locked** | ${issue.locked}${issue.active_lock_reason ? ` — ${issue.active_lock_reason}` : ''} |`,
    `| **Comments** | ${issue.comments} |`,
    `| **Created** | ${issue.created_at} |`,
    `| **Updated** | ${issue.updated_at} |`,
  ];

  if (issue.closed_at) {
    lines.push(`| **Closed** | ${issue.closed_at} |`);
  }
  if (issue.closed_by) {
    lines.push(`| **Closed by** | ${issue.closed_by.login} |`);
  }
  if (labels.length) {
    lines.push(`| **Labels** | ${labels.map((l) => `\`${l}\``).join(', ')} |`);
  }
  if (assignees.length) {
    lines.push(`| **Assignees** | ${assignees.join(', ')} |`);
  }
  if (issue.milestone) {
    lines.push(`| **Milestone** | ${issue.milestone.title} |`);
  }
  if (issue.draft) {
    lines.push(`| **Draft** | true |`);
  }
  if (issue.pull_request) {
    lines.push(`| **Type** | Pull Request |`);
  }
  if (reactions) {
    const rxn = [
      reactions['+1'] && `👍 ${reactions['+1']}`,
      reactions['-1'] && `👎 ${reactions['-1']}`,
      reactions.laugh && `😄 ${reactions.laugh}`,
      reactions.hooray && `🎉 ${reactions.hooray}`,
      reactions.confused && `😕 ${reactions.confused}`,
      reactions.heart && `❤️ ${reactions.heart}`,
      reactions.rocket && `🚀 ${reactions.rocket}`,
      reactions.eyes && `👀 ${reactions.eyes}`,
    ].filter(Boolean);
    if (rxn.length) {
      lines.push(`| **Reactions** | ${rxn.join('  ')} |`);
    }
  }

  lines.push(``);

  if (issue.body) {
    lines.push(`### Description`, ``, issue.body.trim(), ``);
  }

  lines.push(`---`, ``);
  return lines.join('\n');
}

async function toIssueDocMarkdown(issues: Issue[]) {
  const repoInfo = await getGitRepoInfo();
  const lines = [
    `# Open Issues — ${repoInfo.fullName}`,
    ``,
    `> ${issues.length} issues fetched on ${new Date().toISOString()}`,
    ``,
    `---`,
    ``,
    ...issues.map(toIssueMarkdown),
  ];
  return lines.join('\n');
}

export async function getIssuesAsMarkdown() {
  const issues = await getIssues();
  return toIssueDocMarkdown(issues);
}
