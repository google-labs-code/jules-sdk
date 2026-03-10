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
import {
  GetContentsInputSchema,
  GetContentsOutputSchema,
} from './schemas.js';
import {
  getContents,
  compareCommits,
  getPullRequest,
} from '../shared/github.js';
import { readManifest } from './manifest.js';
import { validateFilePath } from '../shared/validators.js';

export async function getContentsHandler(octokit: Octokit, rawInput: any) {
  const input = GetContentsInputSchema.parse(rawInput);
  validateFilePath(input.filePath);
  const [owner, repo] = input.repo.split('/');
  if (!owner || !repo) {
    throw new Error('Repo must be in owner/repo format');
  }

  const manifest = readManifest();
  let refToFetch = '';

  if (input.source === 'main') {
    refToFetch = manifest?.base.branch || 'main';
  } else if (input.source === 'base' && input.baseSha) {
    refToFetch = input.baseSha;
  } else if (input.source === 'base') {
    if (!manifest || manifest.prs.length === 0) {
      throw new Error(
        'Cannot resolve base source without a valid manifest or explicit baseSha',
      );
    }

    // Find PRs that actually touch this file so we compare against the right head.
    const hotZone = (manifest.hotZones ?? []).find(
      (hz) => hz.filePath === input.filePath,
    );
    const cleanFile = manifest.cleanFiles.find(
      (cf) => cf.filePath === input.filePath,
    );
    const relevantPrIds: number[] =
      hotZone?.competingPrs ??
      (cleanFile
        ? [cleanFile.sourcePr]
        : manifest.prs.map((p) => p.id));

    const relevantPrs = manifest.prs.filter((p) =>
      relevantPrIds.includes(p.id),
    );

    let mergeBaseSha: string | undefined;
    for (const pr of relevantPrs) {
      const compare = await compareCommits(
        octokit,
        owner,
        repo,
        manifest.base.sha,
        pr.headSha,
      );
      if ((compare as any).merge_base_commit) {
        mergeBaseSha = (compare as any).merge_base_commit.sha;
        break;
      }
    }

    if (!mergeBaseSha) {
      throw new Error(
        `Could not find merge base commit for ${input.filePath}`,
      );
    }
    refToFetch = mergeBaseSha;
  } else if (input.source.startsWith('pr:')) {
    const prStr = input.source.replace('pr:', '');
    if (!/^\d+$/.test(prStr)) {
      throw new Error(`Invalid PR source: ${input.source}`);
    }
    const prId = parseInt(prStr, 10);
    const pr = await getPullRequest(octokit, owner, repo, prId);
    refToFetch = pr.head.sha;
  } else {
    throw new Error(`Invalid source: ${input.source}`);
  }

  const fileData = await getContents(
    octokit,
    owner,
    repo,
    input.filePath,
    refToFetch,
  );

  return GetContentsOutputSchema.parse({
    filePath: input.filePath,
    source: input.source,
    sha: fileData.sha,
    content: fileData.content,
    encoding: 'utf-8',
    totalLines: fileData.content.split('\n').length,
  });
}
