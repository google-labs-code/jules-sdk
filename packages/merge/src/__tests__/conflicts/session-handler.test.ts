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
vi.mock('@google/jules-sdk', () => ({ jules: {} }));
vi.mock('../../shared/session.js', () => ({
  getSessionChangedFiles: vi.fn(),
  createJulesClient: {},
}));
vi.mock('../../shared/github.js', () => ({
  compareCommits: vi.fn(),
  getFileContent: vi.fn(),
  createOctokit: vi.fn(),
}));

import { SessionCheckHandler } from '../../conflicts/session-handler.js';
import { getSessionChangedFiles } from '../../shared/session.js';
import { compareCommits, getFileContent } from '../../shared/github.js';

describe('SessionCheckHandler', () => {
  const mockOctokit = {} as any;
  const mockJulesClient = {} as any;
  let handler: SessionCheckHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new SessionCheckHandler(mockOctokit, mockJulesClient);
  });

  it('returns clean status when no file overlap', async () => {
    vi.mocked(getSessionChangedFiles).mockResolvedValue([
      { path: 'src/a.ts', changeType: 'modified' },
    ]);
    vi.mocked(compareCommits).mockResolvedValue(['src/b.ts', 'src/c.ts']);

    const result = await handler.execute({
      sessionId: 'session-123',
      repo: 'owner/repo',
      base: 'main',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('clean');
      expect(result.data.conflicts).toEqual([]);
    }
  });

  it('returns conflict status with shadow content when files overlap', async () => {
    vi.mocked(getSessionChangedFiles).mockResolvedValue([
      { path: 'src/a.ts', changeType: 'modified' },
      { path: 'src/b.ts', changeType: 'modified' },
    ]);
    vi.mocked(compareCommits).mockResolvedValue(['src/b.ts', 'src/c.ts']);
    vi.mocked(getFileContent).mockResolvedValue('remote content of b.ts');

    const result = await handler.execute({
      sessionId: 'session-123',
      repo: 'owner/repo',
      base: 'main',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('conflict');
      expect(result.data.conflicts).toHaveLength(1);
      expect(result.data.conflicts[0]).toEqual({
        filePath: 'src/b.ts',
        conflictReason: 'Remote commit modified this file since branch creation.',
        remoteShadowContent: 'remote content of b.ts',
      });
    }
  });

  it('returns SESSION_QUERY_FAILED on SDK error', async () => {
    vi.mocked(getSessionChangedFiles).mockRejectedValue(
      new Error('Session not found'),
    );

    const result = await handler.execute({
      sessionId: 'bad-session',
      repo: 'owner/repo',
      base: 'main',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SESSION_QUERY_FAILED');
    }
  });

  it('returns GITHUB_API_ERROR on GitHub failure', async () => {
    vi.mocked(getSessionChangedFiles).mockResolvedValue([
      { path: 'src/a.ts', changeType: 'modified' },
    ]);
    vi.mocked(compareCommits).mockRejectedValue(
      Object.assign(new Error('Forbidden'), { status: 403 }),
    );

    const result = await handler.execute({
      sessionId: 'session-123',
      repo: 'owner/repo',
      base: 'main',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('GITHUB_API_ERROR');
    }
  });
});
