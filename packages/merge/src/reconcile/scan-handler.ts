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
 * Scan handler — thin orchestrator that delegates to ops:
 *   scan-discover.ts  → PR discovery / explicit ID resolution
 *   scan-classify.ts  → file → hot-zone / clean-file classification
 *   scan-types.ts     → shared types (Zod-inferred)
 */

import { Octokit } from '@octokit/rest';
import { ScanInputSchema, ScanOutputSchema } from './schemas.js';
import {
  getBranch,
  getPullRequest,
  compareCommits,
} from '../shared/github.js';
import { writeManifest, type Manifest } from './manifest.js';
import type { ScanContext, ScanOutput } from './scan-types.js';
import { discoverPrs } from './scan-discover.js';
import { classifyFiles } from './scan-classify.js';

export async function scanHandler(octokit: Octokit, rawInput: unknown) {
  const input = ScanInputSchema.parse(rawInput);
  const [owner, repo] = input.repo.split('/');
  if (!owner || !repo) {
    throw new Error('Repo must be in owner/repo format');
  }

  const baseBranchName =
    input.base || process.env.JULES_MERGE_BASE_BRANCH || 'main';
  const baseBranch = await getBranch(octokit, owner, repo, baseBranchName);
  const baseSha = baseBranch.commit.sha;

  const ctx: ScanContext = {
    octokit,
    input,
    owner,
    repo,
    baseBranchName,
    baseSha,
  };

  // ─── Discover PRs ─────────────────────────────────────────────
  const { prIds, discoveryCount } = await discoverPrs(ctx);

  // ─── Collect file changes per PR ──────────────────────────────
  const prsData: Manifest['prs'] = [];
  const fileToPrs = new Map<string, { prs: number[]; status: string }>();

  for (const prId of prIds) {
    const pr = await getPullRequest(octokit, owner, repo, prId);
    prsData.push({ id: prId, headSha: pr.head.sha, branch: pr.head.ref });

    const compare = await compareCommits(octokit, owner, repo, baseSha, pr.head.sha);
    if (compare.files) {
      for (const file of compare.files) {
        if (!fileToPrs.has(file.filename)) {
          fileToPrs.set(file.filename, { prs: [], status: file.status! });
        }
        fileToPrs.get(file.filename)!.prs.push(prId);
      }
    }
  }

  // ─── Classify files ───────────────────────────────────────────
  const { hotZones, cleanFiles } = classifyFiles(fileToPrs);

  // ─── Persist manifest ─────────────────────────────────────────
  const manifest: Manifest = {
    batchId: `batch-${Date.now()}`,
    createdAt: new Date().toISOString(),
    repo: input.repo,
    base: { branch: baseBranchName, sha: baseSha },
    prs: prsData,
    resolved: [],
    hotZones,
    pending: hotZones.map((hz) => hz.filePath),
    cleanFiles,
  };
  writeManifest(manifest);

  // ─── Build output ─────────────────────────────────────────────
  const output: ScanOutput = {
    status: hotZones.length > 0 ? 'conflicts' : 'clean',
    base: manifest.base,
    prs: prsData.map((pr) => ({
      ...pr,
      files: Array.from(fileToPrs.entries())
        .filter(([_, data]) => data.prs.includes(pr.id))
        .map(([filePath]) => filePath),
    })),
    hotZones,
    cleanFiles,
    ...(discoveryCount !== undefined && {
      discoveredPrs: discoveryCount,
      scannedPrs: prIds.length,
    }),
  };

  return ScanOutputSchema.parse(output);
}
