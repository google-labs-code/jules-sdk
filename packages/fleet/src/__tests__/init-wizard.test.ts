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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateHeadlessInputs } from '../init/wizard/headless.js';
import type { FleetEvent } from '../shared/events.js';

// Mock getGitRepoInfo to avoid real git calls
vi.mock('../shared/auth/git.js', () => ({
  getGitRepoInfo: vi.fn().mockResolvedValue({
    owner: 'test-owner',
    repo: 'test-repo',
    fullName: 'test-owner/test-repo',
  }),
}));

describe('validateHeadlessInputs (Non-Interactive Mode)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all auth-related env vars
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.JULES_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('auto-detects repo from git when no --repo or GITHUB_REPOSITORY', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    const events: FleetEvent[] = [];
    const result = await validateHeadlessInputs({}, (e) => events.push(e));

    expect('success' in result).toBe(false); // Not a fail result
    if (!('success' in result)) {
      expect(result.owner).toBe('test-owner');
      expect(result.repo).toBe('test-repo');
    }
  });

  it('uses --repo flag when provided', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    const events: FleetEvent[] = [];
    const result = await validateHeadlessInputs(
      { repo: 'flag-owner/flag-repo' },
      (e) => events.push(e),
    );

    if (!('success' in result)) {
      expect(result.owner).toBe('flag-owner');
      expect(result.repo).toBe('flag-repo');
    }
  });

  it('uses GITHUB_REPOSITORY env var', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.GITHUB_REPOSITORY = 'env-owner/env-repo';
    const events: FleetEvent[] = [];
    const result = await validateHeadlessInputs({}, (e) => events.push(e));

    if (!('success' in result)) {
      expect(result.owner).toBe('env-owner');
      expect(result.repo).toBe('env-repo');
    }
  });

  it('fails when no auth is configured', async () => {
    const events: FleetEvent[] = [];
    const result = await validateHeadlessInputs(
      { repo: 'o/r' },
      (e) => events.push(e),
    );

    expect('success' in result).toBe(true);
    if ('success' in result) {
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Missing GitHub authentication');
        expect(result.error.message).toContain('--non-interactive');
      }
    }
  });

  it('detects PAT auth from GITHUB_TOKEN', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    const events: FleetEvent[] = [];
    const result = await validateHeadlessInputs(
      { repo: 'o/r' },
      (e) => events.push(e),
    );

    if (!('success' in result)) {
      expect(result.authMethod).toBe('token');
    }
    const authEvent = events.find((e) => e.type === 'init:auth:detected');
    expect(authEvent).toBeDefined();
    if (authEvent && authEvent.type === 'init:auth:detected') {
      expect(authEvent.method).toBe('token');
    }
  });

  it('detects GitHub App auth from env vars', async () => {
    process.env.GITHUB_APP_ID = '123';
    process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = 'key';
    process.env.GITHUB_APP_INSTALLATION_ID = '456';
    const events: FleetEvent[] = [];
    const result = await validateHeadlessInputs(
      { repo: 'o/r' },
      (e) => events.push(e),
    );

    if (!('success' in result)) {
      expect(result.authMethod).toBe('app');
    }
  });

  it('--app-id flag overrides GITHUB_APP_ID env var', async () => {
    process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = 'key';
    process.env.GITHUB_APP_INSTALLATION_ID = '456';
    const events: FleetEvent[] = [];
    const result = await validateHeadlessInputs(
      { repo: 'o/r', 'app-id': 'flag-id' },
      (e) => events.push(e),
    );

    if (!('success' in result)) {
      expect(result.authMethod).toBe('app');
      expect(process.env.GITHUB_APP_ID).toBe('flag-id');
    }
  });

  it('emits warning when JULES_API_KEY is not set', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    const events: FleetEvent[] = [];
    await validateHeadlessInputs({ repo: 'o/r' }, (e) => events.push(e));

    const skipEvent = events.find(
      (e) => e.type === 'init:secret:skipped' && e.name === 'JULES_API_KEY',
    );
    expect(skipEvent).toBeDefined();
    if (skipEvent && skipEvent.type === 'init:secret:skipped') {
      expect(skipEvent.reason).toContain('Not set');
    }
  });

  it('does not warn about JULES_API_KEY when it is set', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.JULES_API_KEY = 'jk_test';
    const events: FleetEvent[] = [];
    await validateHeadlessInputs({ repo: 'o/r' }, (e) => events.push(e));

    const skipEvent = events.find(
      (e) => e.type === 'init:secret:skipped' && e.name === 'JULES_API_KEY',
    );
    expect(skipEvent).toBeUndefined();
  });

  it('never uploads secrets in non-interactive mode', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.JULES_API_KEY = 'jk_test';
    const events: FleetEvent[] = [];
    const result = await validateHeadlessInputs({ repo: 'o/r' }, (e) => events.push(e));

    if (!('success' in result)) {
      expect(Object.keys(result.secretsToUpload)).toHaveLength(0);
    }
  });

  it('emits dry-run event with --dry-run flag', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    const events: FleetEvent[] = [];
    const result = await validateHeadlessInputs(
      { repo: 'o/r', 'dry-run': true },
      (e) => events.push(e),
    );

    if (!('success' in result)) {
      expect(result.dryRun).toBe(true);
    }
    const dryRunEvent = events.find((e) => e.type === 'init:dry-run');
    expect(dryRunEvent).toBeDefined();
    if (dryRunEvent && dryRunEvent.type === 'init:dry-run') {
      expect(dryRunEvent.files.length).toBeGreaterThan(0);
    }
  });

  it('defaults baseBranch to main', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    const events: FleetEvent[] = [];
    const result = await validateHeadlessInputs(
      { repo: 'o/r' },
      (e) => events.push(e),
    );

    if (!('success' in result)) {
      expect(result.baseBranch).toBe('main');
    }
  });

  it('uses --base flag for baseBranch', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    const events: FleetEvent[] = [];
    const result = await validateHeadlessInputs(
      { repo: 'o/r', base: 'develop' },
      (e) => events.push(e),
    );

    if (!('success' in result)) {
      expect(result.baseBranch).toBe('develop');
    }
  });
});
