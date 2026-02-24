// scripts/fleet/orchestrator.ts
import { jules } from '@google/jules-sdk';
import { CachedOctokit } from './github/issues.js';
import { getGitRepoInfo, getCurrentBranch } from './github/git.js';

interface OrchestrationData {
  schema_version: string;
  goal_id?: string;
  target_files: string[];
  severity: 'high' | 'medium' | 'low';
  estimated_complexity: string;
}

const LABEL_PENDING = 'status: pending-dispatch';
const LABEL_EXECUTING = 'status: executing';

async function runOrchestrator() {
  const repoInfo = await getGitRepoInfo();
  const baseBranch =
    process.env.FLEET_BASE_BRANCH ?? (await getCurrentBranch());
  const octokit = new CachedOctokit({ auth: process.env.GITHUB_TOKEN });

  console.log(`🔍 Scanning ${repoInfo.fullName} for pending fleet tasks...`);

  // 1. Fetch pending issues
  const { data: issues } = await octokit.rest.issues.listForRepo({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    state: 'open',
    labels: LABEL_PENDING,
    per_page: 100,
  });

  if (issues.length === 0) {
    console.log('✅ No pending tasks found in queue.');
    return;
  }

  // 2. Parse Payloads & Conflict Resolution
  const claimedFiles = new Set<string>();
  const safeToDispatch: Array<{
    issueNumber: number;
    title: string;
    body: string;
    data: OrchestrationData;
  }> = [];
  const blockedTasks: number[] = [];

  for (const issue of issues) {
    // Regex matches multi-line content inside the specific HTML comment
    const match = issue.body?.match(
      /<!-- JULES_ORCHESTRATION_DATA\s*([\s\S]*?)\s*-->/,
    );
    if (!match || !match[1]) {
      console.warn(
        `⚠️ Skipping #${issue.number}: Missing or malformed JULES_ORCHESTRATION_DATA block.`,
      );
      continue;
    }

    try {
      const data: OrchestrationData = JSON.parse(match[1]);

      // Conflict Check
      let conflict = false;
      for (const file of data.target_files || []) {
        if (claimedFiles.has(file)) {
          console.log(
            `🚧 Skipping #${issue.number}: Target file "${file}" claimed by a higher-priority task.`,
          );
          conflict = true;
          break;
        }
      }

      if (conflict) {
        blockedTasks.push(issue.number);
        continue;
      }

      // Safe to claim
      for (const file of data.target_files || []) claimedFiles.add(file);
      safeToDispatch.push({
        issueNumber: issue.number,
        title: issue.title,
        body: issue.body || '',
        data,
      });
    } catch (e) {
      console.error(`❌ Error parsing JSON payload for #${issue.number}: ${e}`);
    }
  }

  if (safeToDispatch.length === 0) {
    console.log(
      `⏳ Queue contains ${blockedTasks.length} blocked tasks. Waiting for previous PRs to merge.`,
    );
    return;
  }

  // 3. Execution Lock & Dispatch
  console.log(
    `✅ Validated ${safeToDispatch.length} tasks for parallel dispatch...`,
  );

  // We lock the issues sequentially to avoid rate limits
  for (const task of safeToDispatch) {
    console.log(`🔒 Locking #${task.issueNumber} for execution...`);
    await octokit.rest.issues
      .removeLabel({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        issue_number: task.issueNumber,
        name: LABEL_PENDING,
      })
      .catch((e) =>
        console.warn(`Failed to remove label on #${task.issueNumber}: ${e}`),
      );

    await octokit.rest.issues.addLabels({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      issue_number: task.issueNumber,
      labels: [LABEL_EXECUTING],
    });

    await octokit.rest.issues.createComment({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      issue_number: task.issueNumber,
      body: `🤖 **System:** Orchestrator dispatched Jules session. Work is proceeding. The PR will automatically resolve this issue.`,
    });
  }

  // Dispatch parallel Jules sessions using jules.all
  const sessions = await jules.all(safeToDispatch, (task) => ({
    prompt: `
# Task Execution: ${task.title}

You are tasked with resolving GitHub Issue #${task.issueNumber}.
Below is the cognitive analysis and architectural fix provided by the Lead Diagnostics Architect.

## Instructions
1. Review the analysis below.
2. Modify exactly the files requested in the Target Impact section.
3. You must include "Resolves #${task.issueNumber}" in your Pull Request description so GitHub automatically closes this issue upon merge.

---

${task.body.replace(/<!-- JULES_ORCHESTRATION_DATA[\s\S]*?-->/g, '')}
`,
    source: {
      github: repoInfo.fullName,
      baseBranch,
    },
    autoPr: true, // Execution nodes DO create Pull Requests
  }));

  for await (const session of sessions) {
    console.log(`🚀 Session started -> ${session.id}`);
  }
}

runOrchestrator().catch(console.error);
