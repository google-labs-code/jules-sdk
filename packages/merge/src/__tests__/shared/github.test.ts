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

describe('github.ts', () => {
  describe('compareCommits', () => {
    it('returns file paths from comparison', async () => {
      const mockOctokit = {
        repos: {
          compareCommits: vi.fn().mockResolvedValue({
            data: {
              files: [
                { filename: 'src/a.ts' },
                { filename: 'src/b.ts' },
              ],
            },
          }),
        },
      };

      const { compareCommits } = await import('../../shared/github.js');
      const result = await compareCommits(mockOctokit as any, 'owner', 'repo', 'main', 'HEAD');
      expect(result).toEqual(['src/a.ts', 'src/b.ts']);
    });

    it('handles 403 rate limit error', async () => {
      const mockOctokit = {
        repos: {
          compareCommits: vi.fn().mockRejectedValue(
            Object.assign(new Error('rate limit'), { status: 403 }),
          ),
        },
      };

      const { compareCommits } = await import('../../shared/github.js');
      await expect(
        compareCommits(mockOctokit as any, 'owner', 'repo', 'main', 'HEAD'),
      ).rejects.toThrow('rate limit');
    });

    it('handles 404 not found error', async () => {
      const mockOctokit = {
        repos: {
          compareCommits: vi.fn().mockRejectedValue(
            Object.assign(new Error('Not Found'), { status: 404 }),
          ),
        },
      };

      const { compareCommits } = await import('../../shared/github.js');
      await expect(
        compareCommits(mockOctokit as any, 'owner', 'repo', 'main', 'HEAD'),
      ).rejects.toThrow();
    });
  });

  describe('getFileContent', () => {
    it('decodes base64 content', async () => {
      const content = Buffer.from('export const foo = 42;').toString('base64');
      const mockOctokit = {
        repos: {
          getContent: vi.fn().mockResolvedValue({
            data: { content, encoding: 'base64' },
          }),
        },
      };

      const { getFileContent } = await import('../../shared/github.js');
      const result = await getFileContent(mockOctokit as any, 'owner', 'repo', 'src/foo.ts', 'main');
      expect(result).toBe('export const foo = 42;');
    });

    it('returns empty string on 404', async () => {
      const mockOctokit = {
        repos: {
          getContent: vi.fn().mockRejectedValue(
            Object.assign(new Error('Not Found'), { status: 404 }),
          ),
        },
      };

      const { getFileContent } = await import('../../shared/github.js');
      const result = await getFileContent(mockOctokit as any, 'owner', 'repo', 'missing.ts', 'main');
      expect(result).toBe('');
    });
  });
});
