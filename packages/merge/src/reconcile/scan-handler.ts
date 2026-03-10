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
import { ScanInputSchema, ScanOutputSchema } from './schemas.js';
import {
  getBranch,
  getPullRequest,
  compareCommits,
} from '../shared/github.js';
import { writeManifest, type Manifest } from './manifest.js';

function toChangeType(status: string): 'modified' | 'added' | 'deleted' {
  if (status === 'removed') return 'deleted';
  if (status === 'added') return 'added';
  return 'modified';
}

export async function scanHandler(octokit: Octokit, rawInput: any) {
  const input = ScanInputSchema.parse(rawInput);
  const [owner, repo] = input.repo.split('/');
  if (!owner || !repo) {
    throw new Error('Repo must be in owner/repo format');
  }

  const baseBranchName =
    input.base || process.env.JULES_MERGE_BASE_BRANCH || 'main';
  const baseBranch = await getBranch(octokit, owner, repo, baseBranchName);
  const baseSha = baseBranch.commit.sha;

  const prsData: Manifest['prs'] = [];
  const fileToPrs = new Map<string, { prs: number[]; status: string }>();

  for (const prId of input.prs) {
    const pr = await getPullRequest(octokit, owner, repo, prId);
    const headSha = pr.head.sha;
    const branch = pr.head.ref;

    prsData.push({
      id: prId,
      headSha,
      branch,
    });

    const compare = await compareCommits(
      octokit,
      owner,
      repo,
      baseSha,
      headSha,
    );
    if (compare.files) {
      for (const file of compare.files) {
        if (!fileToPrs.has(file.filename)) {
          fileToPrs.set(file.filename, { prs: [], status: file.status! });
        }
        fileToPrs.get(file.filename)!.prs.push(prId);
      }
    }
  }

  const hotZones: any[] = [];
  const cleanFiles: any[] = [];

  for (const [filePath, data] of fileToPrs.entries()) {
    if (data.prs.length > 1) {
      hotZones.push({
        filePath,
        competingPrs: data.prs,
        changeType: toChangeType(data.status),
      });
    } else {
      cleanFiles.push({
        filePath,
        sourcePr: data.prs[0],
        changeType: toChangeType(data.status),
      });
    }
  }

  const batchId = `batch-${Date.now()}`;

  const manifest: Manifest = {
    batchId,
    createdAt: new Date().toISOString(),
    repo: input.repo,
    base: {
      branch: baseBranchName,
      sha: baseSha,
    },
    prs: prsData,
    resolved: [],
    hotZones,
    pending: hotZones.map((hz) => hz.filePath),
    cleanFiles,
  };

  writeManifest(manifest);

  const output = {
    status: hotZones.length > 0 ? 'conflicts' : 'clean',
    base: manifest.base,
    prs: prsData.map((pr) => ({
      ...pr,
      files: Array.from(fileToPrs.entries())
        .filter(([_, data]) => data.prs.includes(pr.id))
        .map(([filePath, _]) => filePath),
    })),
    hotZones,
    cleanFiles,
  };

  return ScanOutputSchema.parse(output);
}
