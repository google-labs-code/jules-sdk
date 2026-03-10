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

import { Octokit } from '@octokit/rest';
import { PushOutputSchema } from './schemas.js';
import * as github from '../shared/github.js';
import { validatePushInput } from './push-validate.js';
import { buildTreeOverlay } from './push-tree.js';
import { createMergeCommits } from './push-commits.js';

export async function pushHandler(octokit: Octokit, rawInput: any) {
  const ctx = await validatePushInput(octokit, rawInput);

  const tree = await buildTreeOverlay(ctx);

  const allParents = [
    ctx.baseSha,
    ...ctx.manifest.prs.map((p) => p.headSha),
  ];

  if (ctx.input.dryRun) {
    return PushOutputSchema.parse({
      status: 'dry-run',
      parents: allParents,
      filesUploaded: tree.filesUploaded,
      filesCarried: tree.filesCarried,
      warnings: ctx.warnings.length > 0 ? ctx.warnings : undefined,
    });
  }

  const newTree = await github.createTree(
    ctx.octokit,
    ctx.owner,
    ctx.repo,
    ctx.baseTreeSha,
    tree.overlay,
  );

  const commits = await createMergeCommits(ctx, newTree.sha);

  // Publish: create/update ref + find-or-create PR
  const refName = `refs/heads/${ctx.input.branch}`;
  try {
    await github.updateRef(
      ctx.octokit,
      ctx.owner,
      ctx.repo,
      refName,
      commits.finalSha,
      true,
    );
  } catch {
    await github.createRef(
      ctx.octokit,
      ctx.owner,
      ctx.repo,
      refName,
      commits.finalSha,
    );
  }

  const existingPrs = await github.listPullRequests(
    ctx.octokit,
    ctx.owner,
    ctx.repo,
    ctx.input.branch,
    ctx.baseBranchName,
    'open',
  );
  const pullRequest =
    existingPrs.length > 0
      ? existingPrs[0]
      : await github.createPullRequest(
          ctx.octokit,
          ctx.owner,
          ctx.repo,
          ctx.input.prTitle || ctx.input.message,
          ctx.input.branch,
          ctx.baseBranchName,
          ctx.input.prBody ||
            'Reconciliation PR created by Jules Merge',
        );

  return PushOutputSchema.parse({
    status: 'pushed',
    commitSha: commits.finalSha,
    branch: ctx.input.branch,
    pullRequest: {
      number: pullRequest.number,
      url: pullRequest.html_url || '',
      title: pullRequest.title,
    },
    parents: commits.parents,
    mergeChain: commits.mergeChain,
    filesUploaded: tree.filesUploaded,
    filesCarried: tree.filesCarried,
    warnings: ctx.warnings.length > 0 ? ctx.warnings : undefined,
  });
}
