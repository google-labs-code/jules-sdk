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
import { join, basename } from 'path';
import { globSync } from 'glob';
import type { Octokit } from 'octokit';
import type { AnalyzeInput, AnalyzeResult, AnalyzeSpec } from './spec.js';
import type { SessionDispatcher } from '../shared/session-dispatcher.js';
import type { FleetEmitter } from '../shared/events.js';
import { ok, fail } from '../shared/result/index.js';
import { parseGoalFile, parseGoalContent } from './goals.js';
import { getMilestoneContext } from './milestone.js';
import { toIssueMarkdown, formatPRContext } from './formatting.js';
import { buildAnalyzerPrompt } from './prompt.js';
import { TRIAGE_GOAL_FILENAME, getBuiltInTriagePrompt } from './triage-prompt.js';

export interface AnalyzeHandlerDeps {
  octokit: Octokit;
  dispatcher: SessionDispatcher;
  emit?: FleetEmitter;
}

/**
 * AnalyzeHandler reads goal files, fetches milestone context,
 * builds a prompt, and dispatches Jules analyzer sessions.
 * Never throws — all errors returned as Result.
 */
export class AnalyzeHandler implements AnalyzeSpec {
  private octokit: Octokit;
  private dispatcher: SessionDispatcher;
  private emit: FleetEmitter;

  constructor(deps: AnalyzeHandlerDeps) {
    this.octokit = deps.octokit;
    this.dispatcher = deps.dispatcher;
    this.emit = deps.emit ?? (() => { });
  }

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

      this.emit({
        type: 'analyze:start',
        owner: input.owner,
        repo: input.repo,
        goalCount: goalFiles.length,
      });

      const sessionsStarted: Array<{ goal: string; sessionId: string }> = [];

      // 2. Process each goal
      for (let i = 0; i < goalFiles.length; i++) {
        const goalFile = goalFiles[i];
        const result = await this.processGoal(goalFile, input, i + 1, goalFiles.length);
        if (result) {
          sessionsStarted.push(result);
        }
      }

      this.emit({
        type: 'analyze:done',
        sessionsStarted: sessionsStarted.length,
        goalsProcessed: goalFiles.length,
      });

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

    const userGoals = globSync(`${input.goalsDir}/*.md`);

    // Auto-inject built-in triage goal if no triage.md exists
    const hasUserTriage = userGoals.some(
      (f) => basename(f) === TRIAGE_GOAL_FILENAME,
    );
    if (!hasUserTriage) {
      // Use a virtual marker — processGoal handles it
      userGoals.push(`__builtin__:${TRIAGE_GOAL_FILENAME}`);
    }

    return userGoals;
  }

  private async processGoal(
    goalFile: string,
    input: AnalyzeInput,
    index: number,
    total: number,
  ): Promise<{ goal: string; sessionId: string } | null> {
    // Handle built-in triage goal
    const isBuiltIn = goalFile.startsWith('__builtin__:');
    let goal: ReturnType<typeof parseGoalFile>;
    let goalInstructions: string;

    if (isBuiltIn) {
      const repoFullName = `${input.owner}/${input.repo}`;
      goalInstructions = getBuiltInTriagePrompt(repoFullName);
      goal = parseGoalContent(goalInstructions);
    } else {
      goal = parseGoalFile(goalFile);
      goalInstructions = readFileSync(goalFile, 'utf-8');
    }

    const displayName = isBuiltIn ? `triage.md (built-in)` : basename(goalFile);
    const milestoneId = input.milestone ?? goal.config?.milestone?.toString();

    this.emit({
      type: 'analyze:goal:start',
      file: displayName,
      index,
      total,
      milestone: milestoneId,
    });

    const ctx = await getMilestoneContext(this.octokit, {
      owner: input.owner,
      repo: input.repo,
      milestone: milestoneId,
    });

    if (ctx.milestone?.title) {
      this.emit({
        type: 'analyze:milestone:resolved',
        title: ctx.milestone.title,
        id: milestoneId!,
      });
    }

    this.emit({
      type: 'analyze:context:fetched',
      openIssues: ctx.issues.open.length,
      closedIssues: ctx.issues.closed.length,
      prs: ctx.pullRequests.length,
    });

    const openContext =
      ctx.issues.open.map(toIssueMarkdown).join('\n') || 'None.';
    const closedContext =
      ctx.issues.closed.map(toIssueMarkdown).join('\n') || 'None.';
    const prContext =
      ctx.pullRequests.map(formatPRContext).join('\n') || 'None.';

    const prompt = buildAnalyzerPrompt({
      goalInstructions,
      openContext,
      closedContext,
      prContext,
      milestoneTitle: ctx.milestone?.title,
      milestoneId,
    });

    this.emit({ type: 'analyze:session:dispatching', goal: displayName });

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

      this.emit({
        type: 'analyze:session:started',
        id: session.id,
        goal: displayName,
      });
      return { goal: goalFile, sessionId: session.id };
    } catch (error) {
      this.emit({
        type: 'analyze:session:failed',
        goal: displayName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
