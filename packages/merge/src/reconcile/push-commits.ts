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

import * as github from '../shared/github.js';
import type { PushContext, CommitResult } from './push-types.js';

export async function createMergeCommits(
  ctx: PushContext,
  treeSha: string,
): Promise<CommitResult> {
  const strategy = ctx.input.mergeStrategy || 'sequential';
  const allParents = [
    ctx.baseSha,
    ...ctx.manifest.prs.map((p) => p.headSha),
  ];

  if (strategy === 'octopus' || ctx.manifest.prs.length === 1) {
    // Single multi-parent commit
    const commit = await github.createCommit(
      ctx.octokit,
      ctx.owner,
      ctx.repo,
      ctx.input.message,
      treeSha,
      allParents,
    );
    return {
      finalSha: commit.sha,
      parents: allParents,
    };
  }

  // Sequential: chain of 2-parent commits
  const mergeChain: CommitResult['mergeChain'] = [];
  let currentSha = ctx.baseSha;

  for (const pr of ctx.manifest.prs) {
    const parents = [currentSha, pr.headSha];
    const commit = await github.createCommit(
      ctx.octokit,
      ctx.owner,
      ctx.repo,
      `${ctx.input.message} (merge PR #${pr.id})`,
      treeSha,
      parents,
    );
    mergeChain.push({
      commitSha: commit.sha,
      parents,
      prId: pr.id,
    });
    currentSha = commit.sha;
  }

  return {
    finalSha: currentSha,
    parents: allParents,
    mergeChain,
  };
}
