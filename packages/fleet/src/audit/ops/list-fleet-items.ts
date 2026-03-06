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
import { nodeKey } from '../graph/types.js';

/**
 * List all open fleet items (issues + PRs) as graph entry points.
 *
 * Issues: open issues with the "fleet" label.
 * PRs: ALL open PRs — the scanner classifies each PR based on
 *      its linked fleet issues rather than branch naming conventions.
 *      PRs without fleet issue links are either skipped or reported
 *      as orphaned/broken graph edges.
 *
 * Returns deduplicated NodeRef[] suitable for full-scan entry points.
 */
export async function listFleetItems(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<NodeRef[]> {
  const seen = new Set<string>();
  const refs: NodeRef[] = [];

  function add(ref: NodeRef): void {
    const key = nodeKey(ref);
    if (!seen.has(key)) {
      seen.add(key);
      refs.push(ref);
    }
  }

  // ── Fleet-labeled issues (paginated) ─────────────────────────────
  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'open',
    labels: 'fleet',
    per_page: 100,
  });

  for (const issue of issues) {
    // GitHub API returns PRs in issue listings — filter them out
    if (issue.pull_request) continue;
    add({ kind: 'issue', id: String(issue.number) });
  }

  // ── All open PRs (paginated) ────────────────────────────────────
  const pulls = await octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });

  for (const pr of pulls) {
    add({ kind: 'pr', id: String(pr.number) });
  }

  return refs;
}
