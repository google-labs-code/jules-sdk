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

/**
 * PR discovery ops — resolves the set of PR IDs to scan,
 * either from explicit `--prs` or `--all` auto-discovery.
 */

import { listOpenPullRequests } from '../shared/github.js';
import { HardError } from '../shared/errors.js';
import type { ScanContext } from './scan-types.js';

const DEFAULT_MAX_PRS = 25;

export interface DiscoveryResult {
  prIds: number[];
  /** Total open PRs found before cap check. Present only for --all mode. */
  discoveryCount?: number;
}

export async function discoverPrs(ctx: ScanContext): Promise<DiscoveryResult> {
  const { input } = ctx;

  if (!input.all) {
    return { prIds: input.prs ?? [] };
  }

  const discovered = await listOpenPullRequests(
    ctx.octokit,
    ctx.owner,
    ctx.repo,
    ctx.baseBranchName,
    input.labels ? { labels: input.labels } : undefined,
  );

  const maxAllowed = input.maxPrs ?? DEFAULT_MAX_PRS;
  if (discovered.length > maxAllowed) {
    throw new HardError(
      `Discovered ${discovered.length} open PRs targeting '${ctx.baseBranchName}', ` +
        `which exceeds the max of ${maxAllowed}. Use --max-prs to increase the limit.`,
    );
  }

  return {
    prIds: discovered.map((pr) => pr.number),
    discoveryCount: discovered.length,
  };
}
