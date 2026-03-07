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
import { createRepo } from '../init/ops/create-repo.js';
import type { FleetEvent } from '../shared/events.js';

/**
 * Create a mock Octokit with configurable behavior for repo creation tests.
 */
function mockOctokit(overrides: {
  userType?: 'Organization' | 'User';
  createInOrgResult?: Record<string, unknown>;
  createForUserResult?: Record<string, unknown>;
  createInOrgError?: { status: number; message: string };
  createForUserError?: { status: number; message: string };
  getUserError?: { status: number; message: string };
} = {}) {
  const defaults = {
    full_name: 'test-org/new-repo',
    html_url: 'https://github.com/test-org/new-repo',
    clone_url: 'https://github.com/test-org/new-repo.git',
  };

  return {
    rest: {
      users: {
        getByUsername: overrides.getUserError
          ? vi.fn().mockRejectedValue(Object.assign(new Error(overrides.getUserError.message), { status: overrides.getUserError.status }))
          : vi.fn().mockResolvedValue({ data: { type: overrides.userType ?? 'Organization' } }),
      },
      repos: {
        createInOrg: overrides.createInOrgError
          ? vi.fn().mockRejectedValue(Object.assign(new Error(overrides.createInOrgError.message), { status: overrides.createInOrgError.status }))
          : vi.fn().mockResolvedValue({ data: overrides.createInOrgResult ?? defaults }),
        createForAuthenticatedUser: overrides.createForUserError
          ? vi.fn().mockRejectedValue(Object.assign(new Error(overrides.createForUserError.message), { status: overrides.createForUserError.status }))
          : vi.fn().mockResolvedValue({ data: overrides.createForUserResult ?? defaults }),
      },
    },
  } as any;
}

describe('createRepo operation', () => {
  it('creates repo in org when owner is Organization', async () => {
    const octokit = mockOctokit({ userType: 'Organization' });
    const events: FleetEvent[] = [];
    const result = await createRepo(
      octokit, 'test-org', 'new-repo', { visibility: 'private' }, (e: FleetEvent) => events.push(e),
    );

    expect('success' in result).toBe(false); // Not a fail result — it's the data
    expect(result).toEqual({
      fullName: 'test-org/new-repo',
      url: 'https://github.com/test-org/new-repo',
      cloneUrl: 'https://github.com/test-org/new-repo.git',
    });
    expect(octokit.rest.repos.createInOrg).toHaveBeenCalledWith(
      expect.objectContaining({ org: 'test-org', name: 'new-repo', visibility: 'private' }),
    );
  });

  it('creates repo for user when owner is User', async () => {
    const octokit = mockOctokit({ userType: 'User' });
    const events: FleetEvent[] = [];
    const result = await createRepo(
      octokit, 'my-user', 'new-repo', { visibility: 'public' }, (e: FleetEvent) => events.push(e),
    );

    expect('success' in result).toBe(false);
    expect(octokit.rest.repos.createForAuthenticatedUser).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'new-repo', private: false }),
    );
  });

  it('returns REPO_CREATE_FAILED on 422 (name taken)', async () => {
    const octokit = mockOctokit({
      userType: 'Organization',
      createInOrgError: { status: 422, message: 'Repository creation failed.' },
    });
    const events: FleetEvent[] = [];
    const result = await createRepo(
      octokit, 'test-org', 'existing-repo', { visibility: 'private' }, (e: FleetEvent) => events.push(e),
    );

    expect('success' in result).toBe(true);
    if ('success' in result && !result.success) {
      expect(result.error.code).toBe('REPO_CREATE_FAILED');
    }
  });

  it('returns REPO_CREATE_FAILED on 403 (insufficient perms)', async () => {
    const octokit = mockOctokit({
      userType: 'Organization',
      createInOrgError: { status: 403, message: 'Resource not accessible by integration' },
    });
    const events: FleetEvent[] = [];
    const result = await createRepo(
      octokit, 'test-org', 'new-repo', { visibility: 'private' }, (e: FleetEvent) => events.push(e),
    );

    expect('success' in result).toBe(true);
    if ('success' in result && !result.success) {
      expect(result.error.code).toBe('REPO_CREATE_FAILED');
      expect(result.error.message).toContain('Resource not accessible');
    }
  });

  it('emits repo:creating and repo:created events on success', async () => {
    const octokit = mockOctokit();
    const events: FleetEvent[] = [];
    await createRepo(octokit, 'test-org', 'new-repo', { visibility: 'private' }, (e: FleetEvent) => events.push(e));

    const types = events.map((e: FleetEvent) => e.type);
    expect(types).toContain('init:repo:creating');
    expect(types).toContain('init:repo:created');
  });

  it('emits repo:failed event on error', async () => {
    const octokit = mockOctokit({
      userType: 'Organization',
      createInOrgError: { status: 422, message: 'Repo exists' },
    });
    const events: FleetEvent[] = [];
    await createRepo(octokit, 'test-org', 'new-repo', { visibility: 'private' }, (e: FleetEvent) => events.push(e));

    const failEvent = events.find((e: FleetEvent) => e.type === 'init:repo:failed');
    expect(failEvent).toBeDefined();
  });

  it('passes description when provided', async () => {
    const octokit = mockOctokit({ userType: 'Organization' });
    const events: FleetEvent[] = [];
    await createRepo(
      octokit, 'test-org', 'new-repo',
      { visibility: 'private', description: 'My awesome repo' },
      (e: FleetEvent) => events.push(e),
    );

    expect(octokit.rest.repos.createInOrg).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'My awesome repo' }),
    );
  });
});
