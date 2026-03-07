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
import { InitInputSchema, type InitInput } from '../init/spec.js';
import { InitHandler } from '../init/handler.js';
import { resolveInput } from '../shared/cli/input.js';
import type { Octokit } from 'octokit';
import type { FleetEvent } from '../shared/events.js';

// ── Mock Octokit ────────────────────────────────────────────────────
// A minimal mock that supports init's full pipeline:
//   - repos.get (check existence)
//   - users.getByUsername (org detection for createRepo)
//   - repos.createInOrg / createForAuthenticatedUser (repo creation)
//   - git.getRef / createRef (branch creation)
//   - repos.createOrUpdateFileContents (file commits)
//   - pulls.create (PR creation)

function createMockOctokit(overrides: {
  repoExists?: boolean;
  userType?: 'Organization' | 'User';
  repoCreateFails?: boolean;
} = {}): Octokit {
  const repoData = {
    full_name: 'test-org/test-repo',
    html_url: 'https://github.com/test-org/test-repo',
    clone_url: 'https://github.com/test-org/test-repo.git',
  };

  return {
    rest: {
      git: {
        getRef: vi.fn().mockResolvedValue({ data: { object: { sha: 'abc123' } } }),
        createRef: vi.fn().mockResolvedValue({ data: {} }),
      },
      repos: {
        get: overrides.repoExists === false
          ? vi.fn().mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))
          : vi.fn().mockResolvedValue({ data: repoData }),
        createOrUpdateFileContents: vi.fn().mockResolvedValue({ data: {} }),
        createInOrg: overrides.repoCreateFails
          ? vi.fn().mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
          : vi.fn().mockResolvedValue({ data: repoData }),
        createForAuthenticatedUser: vi.fn().mockResolvedValue({ data: repoData }),
      },
      pulls: {
        create: vi.fn().mockResolvedValue({
          data: { html_url: 'https://github.com/test-org/test-repo/pull/1', number: 1 },
        }),
      },
      issues: {
        createLabel: vi.fn().mockResolvedValue({ data: {} }),
      },
      users: {
        getByUsername: vi.fn().mockResolvedValue({
          data: { type: overrides.userType ?? 'Organization' },
        }),
      },
    },
  } as unknown as Octokit;
}

// ── Integration Tests ───────────────────────────────────────────────
// These test the full chain: JSON input → resolveInput → InitInputSchema → InitHandler
// without a real GitHub API.

describe('init CLI integration: --json input path', () => {
  it('parses JSON, applies defaults, and runs full pipeline', async () => {
    const json = JSON.stringify({
      owner: 'test-org',
      repoName: 'test-repo',
    });

    const input = resolveInput<InitInput>(InitInputSchema, json);

    // Verify defaults applied
    expect(input.baseBranch).toBe('main');
    expect(input.overwrite).toBe(false);
    expect(input.createRepo).toBe(false);
    expect(input.visibility).toBe('private');
    expect(input.auth).toBe('token');
    expect(input.intervalMinutes).toBe(360);

    // Run through handler
    const octokit = createMockOctokit();
    const events: FleetEvent[] = [];
    const handler = new InitHandler({ octokit, emit: (e: FleetEvent) => events.push(e) });
    const result = await handler.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prUrl).toBe('https://github.com/test-org/test-repo/pull/1');
      expect(result.data.prNumber).toBe(1);
    }
  });

  it('accepts all fields in JSON payload', async () => {
    const json = JSON.stringify({
      owner: 'test-org',
      repoName: 'test-repo',
      baseBranch: 'develop',
      overwrite: true,
      createRepo: true,
      visibility: 'public',
      description: 'Test repo description',
      auth: 'app',
      intervalMinutes: 30,
    });

    const input = resolveInput<InitInput>(InitInputSchema, json);

    expect(input.baseBranch).toBe('develop');
    expect(input.overwrite).toBe(true);
    expect(input.createRepo).toBe(true);
    expect(input.visibility).toBe('public');
    expect(input.description).toBe('Test repo description');
    expect(input.auth).toBe('app');
    expect(input.intervalMinutes).toBe(30);
  });

  it('rejects invalid JSON payload with ZodError', () => {
    const json = JSON.stringify({
      owner: '',  // min(1) violation
      repoName: 'test-repo',
    });

    expect(() => resolveInput<InitInput>(InitInputSchema, json)).toThrow();
  });

  it('rejects malformed JSON string', () => {
    expect(() => resolveInput<InitInput>(InitInputSchema, '{not json}')).toThrow();
  });
});

describe('init CLI integration: flag-based input path', () => {
  it('builds input from flag object and runs pipeline', async () => {
    const input = resolveInput<InitInput>(InitInputSchema, undefined, {
      owner: 'test-org',
      repoName: 'test-repo',
      baseBranch: 'main',
      auth: 'token',
    });

    const octokit = createMockOctokit();
    const events: FleetEvent[] = [];
    const handler = new InitHandler({ octokit, emit: (e: FleetEvent) => events.push(e) });
    const result = await handler.execute(input);

    expect(result.success).toBe(true);
  });
});

describe('init CLI integration: --create-repo', () => {
  it('skips repo creation when repo already exists', async () => {
    const input = resolveInput<InitInput>(InitInputSchema, JSON.stringify({
      owner: 'test-org',
      repoName: 'test-repo',
      createRepo: true,
    }));

    const octokit = createMockOctokit({ repoExists: true });
    const events: FleetEvent[] = [];
    const handler = new InitHandler({ octokit, emit: (e: FleetEvent) => events.push(e) });
    const result = await handler.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repoCreated).toBeUndefined();
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('init:repo:exists');
    expect(types).not.toContain('init:repo:creating');
  });

  it('creates repo when it does not exist and proceeds with init', async () => {
    const input = resolveInput<InitInput>(InitInputSchema, JSON.stringify({
      owner: 'test-org',
      repoName: 'test-repo',
      createRepo: true,
      visibility: 'private',
    }));

    const octokit = createMockOctokit({ repoExists: false });
    const events: FleetEvent[] = [];
    const handler = new InitHandler({ octokit, emit: (e: FleetEvent) => events.push(e) });
    const result = await handler.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repoCreated).toBe(true);
      expect(result.data.prUrl).toBeDefined();
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('init:repo:creating');
    expect(types).toContain('init:repo:created');
    expect(types).toContain('init:pr:created');
  });

  it('returns REPO_CREATE_FAILED when creation fails', async () => {
    const input = resolveInput<InitInput>(InitInputSchema, JSON.stringify({
      owner: 'test-org',
      repoName: 'test-repo',
      createRepo: true,
    }));

    const octokit = createMockOctokit({ repoExists: false, repoCreateFails: true });
    const events: FleetEvent[] = [];
    const handler = new InitHandler({ octokit, emit: (e: FleetEvent) => events.push(e) });
    const result = await handler.execute(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('REPO_CREATE_FAILED');
    }
  });

  it('does not attempt repo creation when createRepo is false', async () => {
    const input = resolveInput<InitInput>(InitInputSchema, JSON.stringify({
      owner: 'test-org',
      repoName: 'test-repo',
      createRepo: false,
    }));

    const octokit = createMockOctokit();
    const events: FleetEvent[] = [];
    const handler = new InitHandler({ octokit, emit: (e: FleetEvent) => events.push(e) });
    const result = await handler.execute(input);

    expect(result.success).toBe(true);

    const types = events.map((e) => e.type);
    expect(types).not.toContain('init:repo:creating');
    expect(types).not.toContain('init:repo:exists');
  });
});

describe('init CLI integration: JSON takes precedence over flags', () => {
  it('prefers JSON payload over flagInput when both provided', () => {
    const input = resolveInput<InitInput>(
      InitInputSchema,
      JSON.stringify({ owner: 'from-json', repoName: 'json-repo' }),
      { owner: 'from-flags', repoName: 'flags-repo' },
    );

    expect(input.owner).toBe('from-json');
    expect(input.repoName).toBe('json-repo');
  });
});
