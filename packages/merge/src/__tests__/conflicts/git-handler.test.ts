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

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock shared modules
vi.mock('../../shared/git.js', () => ({
  gitStatusUnmerged: vi.fn(),
  gitMergeBase: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { GitCheckHandler } from '../../conflicts/git-handler.js';
import { gitStatusUnmerged, gitMergeBase } from '../../shared/git.js';
import { readFile } from 'node:fs/promises';

describe('GitCheckHandler', () => {
  let handler: GitCheckHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new GitCheckHandler();
  });

  it('parses conflict markers and builds task directive', async () => {
    vi.mocked(gitStatusUnmerged).mockResolvedValue({
      ok: true,
      data: ['src/a.ts'],
    });
    vi.mocked(readFile).mockResolvedValue(
      'line1\n<<<<<<< HEAD\nour code\n=======\ntheir code\n>>>>>>> main\nline2' as any,
    );
    vi.mocked(gitMergeBase).mockResolvedValue({
      ok: true,
      data: 'abc123',
    });

    const result = await handler.execute({
      repo: 'owner/repo',
      pullRequestNumber: 42,
      failingCommitSha: 'def456',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe('critical');
      expect(result.data.affectedFiles).toHaveLength(1);
      expect(result.data.affectedFiles[0].filePath).toBe('src/a.ts');
      expect(result.data.affectedFiles[0].baseCommitSha).toBe('abc123');
      expect(result.data.affectedFiles[0].gitConflictMarkers).toContain('<<<<<<< HEAD');
      expect(result.data.taskDirective).toContain('PR #42');
    }
  });

  it('returns NO_UNMERGED_FILES when no conflicts found', async () => {
    vi.mocked(gitStatusUnmerged).mockResolvedValue({
      ok: true,
      data: [],
    });

    const result = await handler.execute({
      repo: 'owner/repo',
      pullRequestNumber: 42,
      failingCommitSha: 'def456',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NO_UNMERGED_FILES');
    }
  });

  it('returns GIT_STATUS_FAILED on git error', async () => {
    vi.mocked(gitStatusUnmerged).mockResolvedValue({
      ok: false,
      error: 'git not found',
    });

    const result = await handler.execute({
      repo: 'owner/repo',
      pullRequestNumber: 42,
      failingCommitSha: 'def456',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('GIT_STATUS_FAILED');
    }
  });
});
