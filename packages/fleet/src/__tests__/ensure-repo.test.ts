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
import { ensureRepo } from '../init/ops/ensure-repo.js';
import type { Octokit } from 'octokit';
import type { FleetEvent } from '../shared/events.js';
import type { InitInput } from '../init/spec.js';

function mockOctokit(overrides: { repoExists?: boolean; createFails?: boolean } = {}): Octokit {
  return {
    rest: {
      repos: {
        get: overrides.repoExists !== false
          ? vi.fn().mockResolvedValue({ data: {} })
          : vi.fn().mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 })),
        createForAuthenticatedUser: overrides.createFails
          ? vi.fn().mockRejectedValue(new Error('Create failed'))
          : vi.fn().mockResolvedValue({
            data: { full_name: 'o/r', html_url: 'https://github.com/o/r', clone_url: 'https://github.com/o/r.git' },
          }),
      },
      users: {
        getByUsername: vi.fn().mockResolvedValue({ data: { type: 'User' } }),
      },
    },
  } as unknown as Octokit;
}

const baseInput = {
  repo: 'o/r',
  owner: 'o',
  repoName: 'r',
  baseBranch: 'main',
  overwrite: false,
  createRepo: true,
  visibility: 'private' as const,
} satisfies Partial<InitInput> as unknown as InitInput;

describe('ensureRepo', () => {
  it('returns undefined when createRepo is false (no-op)', async () => {
    const octokit = mockOctokit();
    const events: FleetEvent[] = [];
    const result = await ensureRepo(
      octokit,
      { ...baseInput, createRepo: false },
      (e: FleetEvent) => events.push(e),
    );
    expect(result).toBeUndefined();
    expect(octokit.rest.repos.get).not.toHaveBeenCalled();
  });

  it('returns undefined when repo already exists', async () => {
    const octokit = mockOctokit({ repoExists: true });
    const events: FleetEvent[] = [];
    const result = await ensureRepo(octokit, baseInput, (e: FleetEvent) => events.push(e));
    expect(result).toBeUndefined();
    const types = events.map((e) => e.type);
    expect(types).toContain('init:repo:exists');
  });

  it('creates repo and returns true when repo does not exist', async () => {
    const octokit = mockOctokit({ repoExists: false });
    const events: FleetEvent[] = [];
    const result = await ensureRepo(octokit, baseInput, (e: FleetEvent) => events.push(e));
    expect(result).toBe(true);
  });

  it('returns failure result when repo creation fails', async () => {
    const octokit = mockOctokit({ repoExists: false, createFails: true });
    const events: FleetEvent[] = [];
    const result = await ensureRepo(octokit, baseInput, (e: FleetEvent) => events.push(e));
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    if (typeof result === 'object' && result !== null && 'success' in result) {
      expect(result.success).toBe(false);
    }
  });
});
