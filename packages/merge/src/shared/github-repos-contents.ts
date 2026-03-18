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
 * Repository contents operations.
 */

import { Octokit } from '@octokit/rest';

export async function getContents(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string,
) {
  const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error(`Expected file at ${path}`);
  }
  return {
    content: Buffer.from(data.content, 'base64').toString('utf8'),
    sha: data.sha,
  };
}
