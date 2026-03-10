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
import type { PushContext, TreeResult } from './push-types.js';

export async function buildTreeOverlay(ctx: PushContext): Promise<TreeResult> {
  const overlay: any[] = [];
  let filesUploaded = 0;
  let filesCarried = 0;

  // Add clean files
  for (const cf of ctx.manifest.cleanFiles) {
    const changeType = (cf as any).changeType;
    if (changeType === 'deleted') {
      overlay.push({
        path: cf.filePath,
        mode: '100644',
        type: 'blob',
        sha: null,
      });
      filesCarried++;
      continue;
    }

    const sourcePr = ctx.manifest.prs.find((p) => p.id === cf.sourcePr);
    if (!sourcePr) continue;

    const fileData = await github.getContents(
      ctx.octokit,
      ctx.owner,
      ctx.repo,
      cf.filePath,
      sourcePr.headSha,
    );
    const blob = await github.createBlob(
      ctx.octokit,
      ctx.owner,
      ctx.repo,
      fileData.content,
    );
    overlay.push({
      path: cf.filePath,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
    filesCarried++;
  }

  // Add resolved files
  for (const resolved of ctx.manifest.resolved) {
    const blob = await github.createBlob(
      ctx.octokit,
      ctx.owner,
      ctx.repo,
      resolved._stagedContent || '',
    );
    overlay.push({
      path: resolved.filePath,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
    filesUploaded++;
  }

  return { overlay, filesUploaded, filesCarried };
}
