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
import type { InitInput, InitResult, InitSpec } from './spec.js';
import { ok, fail } from '../shared/result/index.js';
import { buildWorkflowTemplates } from './templates.js';
import { FeatureReconcileHandler } from './features/handler.js';
import { EXAMPLE_GOAL } from './templates/example-goal.js';
import type { LabelConfigurator } from './types.js';
import type { FleetEmitter } from '../shared/events.js';
import { createBranch, isBranchResult } from './ops/create-branch.js';
import { commitFiles, isCommitResult } from './ops/commit-files.js';
import { createInitPR, isPRResult } from './ops/create-pr.js';
import { execSync } from 'node:child_process';

/**
 * Read the local git author from `git config`.
 * Returns "Name <email>" for Co-authored-by trailers, or undefined on failure.
 */
function getLocalGitAuthor(): string | undefined {
  try {
    const name = execSync('git config user.name', { encoding: 'utf-8' }).trim();
    const email = execSync('git config user.email', { encoding: 'utf-8' }).trim();
    if (name && email) return `${name} <${email}>`;
    return undefined;
  } catch {
    return undefined;
  }
}

export interface InitHandlerDeps {
  octokit: Octokit;
  emit?: FleetEmitter;
  labelConfigurator?: LabelConfigurator;
}

/**
 * InitHandler scaffolds fleet workflow files by creating a PR via GitHub REST API.
 * Never throws — all errors are Result values.
 *
 * Pipeline: createBranch → commitFiles → createInitPR → configureLabels
 */
export class InitHandler implements InitSpec {
  private octokit: Octokit;
  private emit: FleetEmitter;
  private labelConfigurator?: LabelConfigurator;

  constructor(deps: InitHandlerDeps) {
    this.octokit = deps.octokit;
    this.emit = deps.emit ?? (() => { });
    this.labelConfigurator = deps.labelConfigurator;
  }

  async execute(input: InitInput): Promise<InitResult> {
    try {
      const { owner, repoName: repo, baseBranch, overwrite } = input;
      this.emit({ type: 'init:start', owner, repo });

      // 1. Create branch
      const branchResult = await createBranch(
        this.octokit, owner, repo, baseBranch, this.emit,
      );
      if (isBranchResult(branchResult)) return branchResult;
      const { branchName } = branchResult;

      // App auth commits are authored by the bot — attribute the human who ran the command.
      // PAT auth commits are already authored by the user, so no co-author needed.
      const isAppAuth = !!(process.env.FLEET_APP_ID || process.env.GITHUB_APP_ID);

      const ctx = {
        octokit: this.octokit,
        owner,
        repo,
        branchName,
        emit: this.emit,
        coAuthor: isAppAuth ? getLocalGitAuthor() : undefined,
      };

      // 2. Resolve which templates to commit
      let templates = buildWorkflowTemplates(input.intervalMinutes);
      if (input.features) {
        const reconciler = new FeatureReconcileHandler(this.octokit);
        const featureResult = await reconciler.execute({
          owner,
          repo,
          desired: input.features as Record<string, boolean>,
        });
        if (!featureResult.success) {
          return fail(
            'UNKNOWN_ERROR',
            featureResult.error.message,
            featureResult.error.recoverable,
            featureResult.error.suggestion,
          );
        }
        templates = featureResult.data.toAdd;
      }

      // 3. Commit workflow templates + example goal
      const filesResult = await commitFiles(ctx, templates, EXAMPLE_GOAL, overwrite);
      if (isCommitResult(filesResult)) return filesResult;
      const filesCreated = filesResult;

      // 2b. Guard: bail out if every file was skipped (nothing to PR)
      if (filesCreated.length === 0) {
        this.emit({
          type: 'error',
          code: 'ALREADY_INITIALIZED',
          message: 'All fleet files already exist — nothing to commit.',
          suggestion: 'This repo appears to be already initialized. Use jules-fleet configure to update settings.',
        });
        return fail(
          'FILE_COMMIT_FAILED',
          'All fleet files already exist — nothing to commit.',
          false,
          'This repo appears to be already initialized. Use jules-fleet configure to update settings.',
        );
      }

      // 3. Create PR
      const prResult = await createInitPR(ctx, baseBranch, filesCreated);
      if (isPRResult(prResult)) return prResult;
      const { prUrl, prNumber } = prResult;

      // 4. Configure labels
      let labelsCreated: string[] = [];
      if (this.labelConfigurator) {
        const labelResult = await this.labelConfigurator.execute({
          resource: 'labels',
          action: 'create',
          owner,
          repo,
        });
        labelsCreated = labelResult.success ? labelResult.data.created : [];
      }

      this.emit({
        type: 'init:done',
        prUrl,
        files: filesCreated,
        labels: labelsCreated,
      });

      return ok({ prUrl, prNumber, filesCreated, labelsCreated });
    } catch (error) {
      return fail(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }
  }
}

