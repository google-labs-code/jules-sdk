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

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type GitResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * List files with unmerged status (UU) from git status.
 * Used only by the CI failure handler.
 */
export async function gitStatusUnmerged(
  cwd?: string,
): Promise<GitResult<string[]>> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain'],
      { cwd },
    );
    const files = stdout
      .split('\n')
      .filter((line) => line.startsWith('UU '))
      .map((line) => line.slice(3).trim());
    return { ok: true, data: files };
  } catch (error: any) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Find the merge base between two commits.
 * Used only by the CI failure handler.
 */
export async function gitMergeBase(
  head: string,
  base: string,
  cwd?: string,
): Promise<GitResult<string>> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['merge-base', head, base],
      { cwd },
    );
    return { ok: true, data: stdout.trim() };
  } catch (error: any) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
