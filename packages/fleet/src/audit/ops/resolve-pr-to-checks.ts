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
import type { NodeRef } from '../graph/types.js';

/**
 * Resolve a PR to its check runs via the GitHub Checks API.
 * Returns NodeRef[] for each check run.
 */
export async function resolvePRToChecks(
  octokit: Octokit,
  owner: string,
  repo: string,
  headSha: string,
): Promise<NodeRef[]> {
  const { data } = await octokit.rest.checks.listForRef({
    owner,
    repo,
    ref: headSha,
    per_page: 100,
  });

  return data.check_runs.map((run) => ({
    kind: 'check-run' as const,
    id: String(run.id),
  }));
}
