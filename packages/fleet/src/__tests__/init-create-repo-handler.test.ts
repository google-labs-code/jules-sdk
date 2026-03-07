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
import { InitHandler } from '../init/handler.js';
import type { Octokit } from 'octokit';
import type { FleetEvent } from '../shared/events.js';

/**
 * Extended mock Octokit that includes repo creation APIs
 * alongside the existing init APIs (git, repos, pulls).
 */
function createMockOctokit(overrides: {
  /** Whether the repo already exists (GET /repos succeeds) */
  repoExists?: boolean;
  /** Owner type for user detection */
  userType?: 'Organization' | 'User';
  /** If true, repo creation throws 403 */
  repoCreateFails403?: boolean;
  /** If true, repo creation throws 422 */
  repoCreateFails422?: boolean;
} = {}): Octokit {
  const repoDefaults = {
    full_name: 'o/r',
    html_url: 'https://github.com/o/r',
    clone_url: 'https://github.com/o/r.git',
  };

  return {
    rest: {
      git: {
        getRef: vi.fn().mockResolvedValue({
          data: { object: { sha: 'abc123' } },
        }),
        createRef: vi.fn().mockResolvedValue({ data: {} }),
      },
      repos: {
        get: overrides.repoExists === false
          ? vi.fn().mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))
          : vi.fn().mockResolvedValue({ data: repoDefaults }),
        createOrUpdateFileContents: vi.fn().mockResolvedValue({ data: {} }),
        createInOrg: overrides.repoCreateFails403
          ? vi.fn().mockRejectedValue(Object.assign(new Error('Resource not accessible'), { status: 403 }))
          : overrides.repoCreateFails422
            ? vi.fn().mockRejectedValue(Object.assign(new Error('Repo exists'), { status: 422 }))
            : vi.fn().mockResolvedValue({ data: repoDefaults }),
        createForAuthenticatedUser: vi.fn().mockResolvedValue({ data: repoDefaults }),
      },
      pulls: {
        create: vi.fn().mockResolvedValue({
          data: { html_url: 'https://github.com/o/r/pull/1', number: 1 },
        }),
      },
      users: {
        getByUsername: vi.fn().mockResolvedValue({
          data: { type: overrides.userType ?? 'Organization' },
        }),
      },
    },
  } as unknown as Octokit;
}

const baseInput = {
  owner: 'o',
  repoName: 'r',
  baseBranch: 'main',
  overwrite: false,
  intervalMinutes: 360,
  auth: 'token' as const,
  visibility: 'private' as const,
  createRepo: false,
};

describe('InitHandler with createRepo', () => {
  it('creates repo then proceeds with init when createRepo=true and repo does not exist', async () => {
    const octokit = createMockOctokit({ repoExists: false });
    const events: FleetEvent[] = [];
    const handler = new InitHandler({ octokit, emit: (e: FleetEvent) => events.push(e) });

    const result = await handler.execute({ ...baseInput, createRepo: true, visibility: 'private' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repoCreated).toBe(true);
      expect(result.data.prUrl).toBe('https://github.com/o/r/pull/1');
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('init:repo:creating');
    expect(types).toContain('init:repo:created');
    expect(types).toContain('init:branch:created');
    expect(types).toContain('init:pr:created');
  });

  it('skips repo creation when createRepo=true but repo already exists', async () => {
    const octokit = createMockOctokit({ repoExists: true });
    const events: FleetEvent[] = [];
    const handler = new InitHandler({ octokit, emit: (e: FleetEvent) => events.push(e) });

    const result = await handler.execute({ ...baseInput, createRepo: true, visibility: 'private' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repoCreated).toBeUndefined();
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('init:repo:exists');
    expect(types).not.toContain('init:repo:creating');
  });

  it('returns REPO_CREATE_FAILED when creation fails with 403', async () => {
    const octokit = createMockOctokit({ repoExists: false, repoCreateFails403: true });
    const events: FleetEvent[] = [];
    const handler = new InitHandler({ octokit, emit: (e: FleetEvent) => events.push(e) });

    const result = await handler.execute({ ...baseInput, createRepo: true, visibility: 'private' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('REPO_CREATE_FAILED');
      expect(result.error.message).toContain('Resource not accessible');
    }
  });

  it('does not create repo when createRepo is false (default behavior)', async () => {
    const octokit = createMockOctokit();
    const events: FleetEvent[] = [];
    const handler = new InitHandler({ octokit, emit: (e: FleetEvent) => events.push(e) });

    const result = await handler.execute(baseInput);

    expect(result.success).toBe(true);

    const types = events.map((e) => e.type);
    expect(types).not.toContain('init:repo:creating');
    expect(types).not.toContain('init:repo:exists');
  });
});
