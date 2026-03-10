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
import { MergeInputSchema, MergeOutputSchema } from './schemas.js';
import { getPullRequest, mergePullRequest } from '../shared/github.js';
import { HardError } from '../shared/errors.js';

export async function mergeHandler(octokit: Octokit, rawInput: any) {
  const input = MergeInputSchema.parse(rawInput);
  const [owner, repo] = input.repo.split('/');
  if (!owner || !repo) {
    throw new Error('Repo must be in owner/repo format');
  }

  const pr = await getPullRequest(octokit, owner, repo, input.pr);

  if (pr.state !== 'open') {
    throw new HardError(
      `PR #${input.pr} is not open (state: ${pr.state})`,
    );
  }

  if (!pr.mergeable) {
    throw new HardError(
      `PR #${input.pr} is not mergeable — resolve conflicts first`,
    );
  }

  const result = await mergePullRequest(
    octokit,
    owner,
    repo,
    input.pr,
    'merge',
  );

  return MergeOutputSchema.parse({
    status: 'merged',
    pr: input.pr,
    sha: result.sha,
    url: pr.html_url,
  });
}
