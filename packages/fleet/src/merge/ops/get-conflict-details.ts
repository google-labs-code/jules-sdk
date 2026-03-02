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

const MAX_FILE_SIZE = 8000;

/**
 * Fetches the current base branch content of each conflicting file.
 * Returns a formatted markdown block showing the base branch state,
 * or empty string on failure (non-fatal).
 */
export async function getConflictDetails(
  octokit: Octokit,
  owner: string,
  repo: string,
  conflictingFiles: string[],
  baseBranch: string,
): Promise<string> {
  if (conflictingFiles.length === 0) return '';

  const fileContents: Array<{ path: string; content: string }> = [];

  await Promise.all(
    conflictingFiles.map(async (filePath) => {
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: filePath,
          ref: baseBranch,
        });

        if ('content' in data && data.content) {
          let content = Buffer.from(data.content, 'base64').toString('utf-8');
          if (content.length > MAX_FILE_SIZE) {
            content = content.slice(0, MAX_FILE_SIZE) + '\n... (truncated)';
          }
          fileContents.push({ path: filePath, content });
        }
      } catch {
        // Non-fatal — skip files we can't fetch
      }
    }),
  );

  if (fileContents.length === 0) return '';

  const lines = [
    '## Current Base Branch State',
    'The following shows the current content of conflicting files on the base branch.',
    'Your changes must be compatible with this state:',
    '',
  ];

  for (const { path, content } of fileContents) {
    lines.push(`### \`${path}\``);
    lines.push('```');
    lines.push(content);
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}
