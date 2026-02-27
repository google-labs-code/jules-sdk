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

// Mock child_process
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: (fn: any) => fn,
}));

import { execFile } from 'node:child_process';

describe('git.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('gitStatusUnmerged', () => {
    it('parses UU lines from porcelain output', async () => {
      vi.mocked(execFile).mockImplementation(
        ((_cmd: any, _args: any, _opts: any) => {
          return Promise.resolve({
            stdout: 'UU src/a.ts\nUU src/b.ts\nM  src/c.ts\n',
            stderr: '',
          });
        }) as any,
      );

      const { gitStatusUnmerged } = await import('../../shared/git.js');
      const result = await gitStatusUnmerged();
      expect(result).toEqual({ ok: true, data: ['src/a.ts', 'src/b.ts'] });
    });

    it('returns empty array when no conflicts', async () => {
      vi.mocked(execFile).mockImplementation(
        ((_cmd: any, _args: any, _opts: any) => {
          return Promise.resolve({ stdout: 'M  src/c.ts\n', stderr: '' });
        }) as any,
      );

      const { gitStatusUnmerged } = await import('../../shared/git.js');
      const result = await gitStatusUnmerged();
      expect(result).toEqual({ ok: true, data: [] });
    });

    it('returns error on exec failure', async () => {
      vi.mocked(execFile).mockImplementation(
        ((_cmd: any, _args: any, _opts: any) => {
          return Promise.reject(new Error('git not found'));
        }) as any,
      );

      const { gitStatusUnmerged } = await import('../../shared/git.js');
      const result = await gitStatusUnmerged();
      expect(result).toEqual({ ok: false, error: 'git not found' });
    });
  });

  describe('gitMergeBase', () => {
    it('returns trimmed SHA', async () => {
      vi.mocked(execFile).mockImplementation(
        ((_cmd: any, _args: any, _opts: any) => {
          return Promise.resolve({ stdout: 'abc123def456\n', stderr: '' });
        }) as any,
      );

      const { gitMergeBase } = await import('../../shared/git.js');
      const result = await gitMergeBase('HEAD', 'main');
      expect(result).toEqual({ ok: true, data: 'abc123def456' });
    });
  });
});
