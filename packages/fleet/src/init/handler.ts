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
import type { LabelConfigurator } from './types.js';
import type { FleetEmitter } from '../shared/events.js';
import { createBranch, isBranchResult } from './ops/create-branch.js';
import { commitFiles, isCommitResult } from './ops/commit-files.js';
import { createInitPR, isPRResult } from './ops/create-pr.js';
import { ensureRepo } from './ops/ensure-repo.js';
import { resolveTemplates } from './ops/resolve-templates.js';
import { buildCommitContext } from './ops/commit-context.js';
import { EXAMPLE_GOAL } from './templates/example-goal.js';

export interface InitHandlerDeps {
  octokit: Octokit;
  emit?: FleetEmitter;
  labelConfigurator?: LabelConfigurator;
}

/**
 * InitHandler scaffolds fleet workflow files by creating a PR via GitHub REST API.
 * Never throws — all errors are Result values.
 *
 * Pipeline: ensureRepo → createBranch → resolveTemplates → commitFiles → createPR → configureLabels
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

      // 1. Ensure repo exists (creates if needed)
      const repoResult = await ensureRepo(this.octokit, input, this.emit);
      if (typeof repoResult === 'object' && repoResult !== null) return repoResult;
      const repoCreated = repoResult === true ? true : undefined;

      // 2. Create branch
      const branchResult = await createBranch(
        this.octokit, owner, repo, baseBranch, this.emit,
      );
      if (isBranchResult(branchResult)) return branchResult;
      const { branchName } = branchResult;

      // 3. Resolve templates
      const templateResult = await resolveTemplates(this.octokit, input);
      if ('success' in templateResult) return templateResult;
      const templates = templateResult;

      // 4. Commit workflow templates + example goal
      const ctx = buildCommitContext(this.octokit, owner, repo, branchName, this.emit);
      const filesResult = await commitFiles(ctx, templates, EXAMPLE_GOAL, overwrite);
      if (isCommitResult(filesResult)) return filesResult;
      const filesCreated = filesResult;

      // 5. Guard: bail out if every file was skipped (nothing to PR)
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

      // 6. Create PR
      const prResult = await createInitPR(ctx, baseBranch, filesCreated);
      if (isPRResult(prResult)) return prResult;
      const { prUrl, prNumber } = prResult;

      // 7. Configure labels
      let labelsCreated: string[] = [];
      if (this.labelConfigurator) {
        const labelResult = await this.labelConfigurator.execute({
          resource: 'labels',
          action: 'create',
          owner,
          repo,
          auth: 'token',
        });
        labelsCreated = labelResult.success ? labelResult.data.created : [];
      }

      this.emit({
        type: 'init:done',
        prUrl,
        files: filesCreated,
        labels: labelsCreated,
      });

      return ok({ prUrl, prNumber, filesCreated, labelsCreated, repoCreated });
    } catch (error) {
      return fail(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }
  }
}
