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

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Octokit } from 'octokit';
import type { InitInput, InitResult, InitSpec } from './spec.js';
import { ok, fail } from '../shared/result/index.js';
import type { ConfigureResult } from '../configure/spec.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Files to commit in the init PR */
interface TemplateFile {
  /** Path in the repo (relative) */
  repoPath: string;
  /** Path to the template file on disk */
  templatePath: string;
}

const TEMPLATE_FILES: TemplateFile[] = [
  {
    repoPath: '.github/workflows/fleet-merge.yml',
    templatePath: join(__dirname, 'templates', 'fleet-merge.yml'),
  },
  {
    repoPath: '.github/workflows/fleet-dispatch.yml',
    templatePath: join(__dirname, 'templates', 'fleet-dispatch.yml'),
  },
  {
    repoPath: '.github/workflows/fleet-analyze.yml',
    templatePath: join(__dirname, 'templates', 'fleet-analyze.yml'),
  },
];

const EXAMPLE_GOAL = `---
milestone: "1"
---

# Example Fleet Goal

Analyze the codebase for potential improvements and create issues for the engineering team.

## Focus Areas
- Code quality improvements
- Missing test coverage
- Documentation gaps
- Performance optimizations

## Rules
- Do NOT propose changes already covered by open issues
- Do NOT propose changes rejected in recently closed issues
- Each insight should be actionable and specific
`;

/** Interface for label configuration — decouples init from configure slice */
export interface LabelConfigurator {
  execute(input: {
    resource: 'labels';
    action: 'create';
    owner: string;
    repo: string;
  }): Promise<ConfigureResult>;
}

/**
 * InitHandler scaffolds fleet workflow files by creating a PR via GitHub REST API.
 * Never throws — all errors are Result values.
 */
export class InitHandler implements InitSpec {
  constructor(
    private octokit: Octokit,
    private log: (msg: string) => void = console.log,
    private labelConfigurator?: LabelConfigurator,
  ) { }

  async execute(input: InitInput): Promise<InitResult> {
    try {
      const { owner, repoName: repo, baseBranch } = input;

      // 1. Get default branch SHA
      this.log(`📦 Initializing fleet for ${owner}/${repo}...`);
      const { data: refData } = await this.octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`,
      });
      const baseSha = refData.object.sha;

      // 2. Create a new branch
      const branchName = `fleet-init-${Date.now()}`;
      this.log(`  🌿 Creating branch: ${branchName}`);
      try {
        await this.octokit.rest.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${branchName}`,
          sha: baseSha,
        });
      } catch (error) {
        return fail(
          'BRANCH_CREATE_FAILED',
          `Failed to create branch "${branchName}": ${error instanceof Error ? error.message : error}`,
          true,
        );
      }

      // 3. Commit template files
      const filesCreated: string[] = [];

      for (const tmpl of TEMPLATE_FILES) {
        try {
          const content = readFileSync(tmpl.templatePath, 'utf-8');
          await this.octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: tmpl.repoPath,
            message: `chore: add ${tmpl.repoPath}`,
            content: Buffer.from(content).toString('base64'),
            branch: branchName,
          });
          filesCreated.push(tmpl.repoPath);
          this.log(`  📄 Added: ${tmpl.repoPath}`);
        } catch (error: unknown) {
          const status =
            error && typeof error === 'object' && 'status' in error
              ? (error as { status: number }).status
              : 0;
          if (status === 422) {
            this.log(`  ⏭️  Already exists: ${tmpl.repoPath}`);
          } else {
            return fail(
              'FILE_COMMIT_FAILED',
              `Failed to commit "${tmpl.repoPath}": ${error instanceof Error ? error.message : error}`,
              true,
            );
          }
        }
      }

      // Commit example goal
      try {
        await this.octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: '.fleet/goals/example.md',
          message: 'chore: add example fleet goal',
          content: Buffer.from(EXAMPLE_GOAL).toString('base64'),
          branch: branchName,
        });
        filesCreated.push('.fleet/goals/example.md');
        this.log(`  📄 Added: .fleet/goals/example.md`);
      } catch (error: unknown) {
        const status =
          error && typeof error === 'object' && 'status' in error
            ? (error as { status: number }).status
            : 0;
        if (status !== 422) {
          this.log(
            `  ⚠️ Failed to create example goal: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      // 4. Create PR
      this.log(`  🔗 Creating pull request...`);
      let prUrl: string;
      let prNumber: number;
      try {
        const { data: pr } = await this.octokit.rest.pulls.create({
          owner,
          repo,
          title: 'chore: initialize fleet workflows',
          body: [
            '## Fleet Initialization',
            '',
            'This PR adds the fleet workflow files for automated issue dispatch, merge, and analysis.',
            '',
            '### Files added',
            ...filesCreated.map((f) => `- \`${f}\``),
            '',
            '### Next steps',
            '1. Merge this PR',
            '2. Add `JULES_API_KEY` to your repo secrets',
            '3. Create milestones and issues with the `fleet` label',
            '4. Run `jules-fleet configure labels` to set up labels (or they were already created)',
          ].join('\n'),
          head: branchName,
          base: baseBranch,
        });
        prUrl = pr.html_url;
        prNumber = pr.number;
        this.log(`  ✅ PR created: ${prUrl}`);
      } catch (error) {
        return fail(
          'PR_CREATE_FAILED',
          `Failed to create PR: ${error instanceof Error ? error.message : error}`,
          true,
        );
      }

      // 5. Configure labels (if configurator provided)
      let labelsCreated: string[] = [];
      if (this.labelConfigurator) {
        this.log(`  🏷️  Configuring labels...`);
        const labelResult = await this.labelConfigurator.execute({
          resource: 'labels',
          action: 'create',
          owner,
          repo,
        });

        labelsCreated = labelResult.success
          ? labelResult.data.created
          : [];
      }

      return ok({
        prUrl,
        prNumber,
        filesCreated,
        labelsCreated,
      });
    } catch (error) {
      return fail(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }
  }
}
