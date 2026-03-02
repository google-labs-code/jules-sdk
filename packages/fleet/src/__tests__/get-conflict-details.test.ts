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

import { describe, it, expect, vi } from 'vitest';
import { getConflictDetails } from '../merge/ops/get-conflict-details.js';

function createMockOctokit(fileContents: Record<string, string>, failures: string[] = []) {
  return {
    rest: {
      repos: {
        getContent: vi.fn().mockImplementation(({ path }: any) => {
          if (failures.includes(path)) {
            throw new Error('Not found');
          }
          const content = fileContents[path] ?? '';
          return Promise.resolve({
            data: {
              content: Buffer.from(content).toString('base64'),
            },
          });
        }),
      },
    },
  } as any;
}

describe('getConflictDetails', () => {
  it('returns formatted markdown with file contents', async () => {
    const octokit = createMockOctokit({
      'src/client.py': 'class Client:\n  pass',
    });

    const result = await getConflictDetails(octokit, 'owner', 'repo', ['src/client.py'], 'main');

    expect(result).toContain('## Current Base Branch State');
    expect(result).toContain('`src/client.py`');
    expect(result).toContain('class Client:');
  });

  it('includes multiple files', async () => {
    const octokit = createMockOctokit({
      'src/a.ts': 'const a = 1;',
      'src/b.ts': 'const b = 2;',
    });

    const result = await getConflictDetails(
      octokit, 'owner', 'repo', ['src/a.ts', 'src/b.ts'], 'main',
    );

    expect(result).toContain('`src/a.ts`');
    expect(result).toContain('`src/b.ts`');
    expect(result).toContain('const a = 1;');
    expect(result).toContain('const b = 2;');
  });

  it('returns empty string when no files provided', async () => {
    const octokit = createMockOctokit({});
    const result = await getConflictDetails(octokit, 'owner', 'repo', [], 'main');
    expect(result).toBe('');
  });

  it('skips files that fail to fetch (non-fatal)', async () => {
    const octokit = createMockOctokit(
      { 'src/a.ts': 'const a = 1;' },
      ['src/b.ts'],
    );

    const result = await getConflictDetails(
      octokit, 'owner', 'repo', ['src/a.ts', 'src/b.ts'], 'main',
    );

    expect(result).toContain('`src/a.ts`');
    expect(result).not.toContain('`src/b.ts`');
  });

  it('returns empty string when all files fail', async () => {
    const octokit = createMockOctokit({}, ['src/a.ts']);
    const result = await getConflictDetails(octokit, 'owner', 'repo', ['src/a.ts'], 'main');
    expect(result).toBe('');
  });

  it('truncates large files', async () => {
    const largeContent = 'x'.repeat(10000);
    const octokit = createMockOctokit({ 'big.ts': largeContent });

    const result = await getConflictDetails(octokit, 'owner', 'repo', ['big.ts'], 'main');

    expect(result).toContain('(truncated)');
    expect(result.length).toBeLessThan(largeContent.length);
  });

  it('passes baseBranch as ref', async () => {
    const octokit = createMockOctokit({ 'src/a.ts': 'ok' });

    await getConflictDetails(octokit, 'myorg', 'myrepo', ['src/a.ts'], 'develop');

    expect(octokit.rest.repos.getContent).toHaveBeenCalledWith({
      owner: 'myorg',
      repo: 'myrepo',
      path: 'src/a.ts',
      ref: 'develop',
    });
  });
});
