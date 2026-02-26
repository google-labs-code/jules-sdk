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

import { readFileSync, existsSync } from 'fs';
import { globSync } from 'glob';
import type { Octokit } from 'octokit';
import type { AnalyzeInput, AnalyzeResult, AnalyzeSpec } from './spec.js';
import type { SessionDispatcher } from '../shared/session-dispatcher.js';
import { ok, fail } from '../shared/result/index.js';
import { parseGoalFile } from './goals.js';
import { getMilestoneContext } from './milestone.js';
import { toIssueMarkdown, formatPRContext } from './formatting.js';
import { buildAnalyzerPrompt } from './prompt.js';

/**
 * AnalyzeHandler reads goal files, fetches milestone context,
 * builds a prompt, and dispatches Jules analyzer sessions.
 * Never throws — all errors returned as Result.
 */
export class AnalyzeHandler implements AnalyzeSpec {
  constructor(
    private octokit: Octokit,
    private dispatcher: SessionDispatcher,
    private log: (msg: string) => void = console.log,
  ) {}

  async execute(input: AnalyzeInput): Promise<AnalyzeResult> {
    try {
      // 1. Resolve goal files
      const goalFiles = this.resolveGoalFiles(input);

      if (goalFiles.length === 0) {
        return fail(
          'NO_GOALS_FOUND',
          `No goal files found in ${input.goalsDir}/`,
          true,
          'Create a .md file in .fleet/goals/ or pass --goal <path>',
        );
      }

      this.log(`📂 Processing ${goalFiles.length} goal file(s)...`);

      const sessionsStarted: Array<{ goal: string; sessionId: string }> = [];

      // 2. Process each goal
      for (const goalFile of goalFiles) {
        this.log(`\n${'─'.repeat(60)}`);
        const result = await this.processGoal(goalFile, input);
        if (result) {
          sessionsStarted.push(result);
        }
      }

      this.log(`\n✅ All ${goalFiles.length} goal(s) processed.`);
      return ok({ sessionsStarted });
    } catch (error) {
      return fail(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }
  }

  private resolveGoalFiles(input: AnalyzeInput): string[] {
    if (input.goal) {
      if (!existsSync(input.goal)) {
        return [];
      }
      return [input.goal];
    }
    return globSync(`${input.goalsDir}/*.md`);
  }

  private async processGoal(
    goalFile: string,
    input: AnalyzeInput,
  ): Promise<{ goal: string; sessionId: string } | null> {
    const goal = parseGoalFile(goalFile);
    const milestoneId = input.milestone ?? goal.config?.milestone?.toString();

    if (milestoneId) {
      this.log(`📡 Fetching context for Milestone ${milestoneId}...`);
    } else {
      this.log('📡 Running in General Mode (no milestone)...');
    }

    const ctx = await getMilestoneContext(this.octokit, {
      owner: input.owner,
      repo: input.repo,
      milestone: milestoneId,
    });

    if (ctx.milestone?.title) {
      this.log(`✅ Milestone resolved: "${ctx.milestone.title}"`);
    }

    const openContext =
      ctx.issues.open.map(toIssueMarkdown).join('\n') || 'None.';
    const closedContext =
      ctx.issues.closed.map(toIssueMarkdown).join('\n') || 'None.';
    const prContext =
      ctx.pullRequests.map(formatPRContext).join('\n') || 'None.';

    this.log(
      `📄 Context: ${ctx.issues.open.length} open + ${ctx.issues.closed.length} closed issues, ${ctx.pullRequests.length} PRs`,
    );

    const goalInstructions = readFileSync(goalFile, 'utf-8');

    const prompt = buildAnalyzerPrompt({
      goalInstructions,
      openContext,
      closedContext,
      prContext,
      milestoneTitle: ctx.milestone?.title,
      milestoneId,
    });

    this.log(`🔍 Dispatching Analyzer session for ${goalFile}...`);

    try {
      const session = await this.dispatcher.dispatch({
        prompt,
        source: {
          github: `${input.owner}/${input.repo}`,
          baseBranch: input.baseBranch,
        },
        requireApproval: false,
        autoPr: false,
      });

      this.log(`✅ Analyzer session started: ${session.id}`);
      return { goal: goalFile, sessionId: session.id };
    } catch (error) {
      this.log(
        `❌ Failed to dispatch session for ${goalFile}: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }
}
