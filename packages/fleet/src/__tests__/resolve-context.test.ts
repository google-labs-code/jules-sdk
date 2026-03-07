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
import { resolveInitContext, type InitContext, type InitContextResult } from '../init/resolve-context.js';

/** Narrow InitContextResult to InitContext, failing the test if it's a failure. */
function assertSuccess(result: InitContextResult): InitContext {
  expect(result).not.toHaveProperty('success', false);
  return result as InitContext;
}
import type { FleetEvent } from '../shared/events.js';

// Mock the wizard modules so we don't trigger real prompts or git detection
vi.mock('../init/wizard/index.js', () => ({
  runInitWizard: vi.fn(),
  validateHeadlessInputs: vi.fn(),
}));

// Mock octokit creation
vi.mock('../shared/auth/octokit.js', () => ({
  createFleetOctokit: vi.fn(() => ({ rest: {}, auth: 'mocked-app' })),
}));

// Mock isInteractive — default to false (non-interactive)
vi.mock('../shared/ui/index.js', () => ({
  isInteractive: vi.fn(() => false),
  createRenderer: vi.fn(() => ({ start: vi.fn(), end: vi.fn(), error: vi.fn(), render: vi.fn() })),
  createEmitter: vi.fn(() => vi.fn()),
}));

describe('resolveInitContext', () => {
  const originalEnv = process.env;
  const noopEmit = (() => { }) as unknown as (e: FleetEvent) => void;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.JULES_API_KEY;
    delete process.env.FLEET_APP_ID;
    delete process.env.GITHUB_APP_ID;
    delete process.env.FLEET_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
    delete process.env.FLEET_APP_INSTALLATION_ID;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('JSON path (args.json)', () => {
    it('parses JSON input and returns InitContext', async () => {
      const args = {
        json: JSON.stringify({
          owner: 'testowner',
          repoName: 'testrepo',
          baseBranch: 'main',
          auth: 'token',
        }),
      };

      const ctx = assertSuccess(await resolveInitContext(args, noopEmit));
      expect(ctx.input.owner).toBe('testowner');
      expect(ctx.input.repoName).toBe('testrepo');
      expect(ctx.input.auth).toBe('token');
      expect(ctx.octokit).toBeDefined();
    });

    it('auto-detects secrets from env in JSON path', async () => {
      process.env.JULES_API_KEY = 'sk-from-env';
      const args = {
        json: JSON.stringify({
          owner: 'testowner',
          repoName: 'testrepo',
          baseBranch: 'main',
          auth: 'token',
        }),
      };

      const ctx = assertSuccess(await resolveInitContext(args, noopEmit));
      expect(ctx.secrets).toEqual({ JULES_API_KEY: 'sk-from-env' });
    });

    it('creates token-based Octokit when auth=token', async () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';
      const args = {
        json: JSON.stringify({
          owner: 'testowner',
          repoName: 'testrepo',
          auth: 'token',
        }),
      };

      const ctx = await resolveInitContext(args, noopEmit);
      // Should NOT have called createFleetOctokit (which does App auth)
      const { createFleetOctokit } = await import('../shared/auth/octokit.js');
      expect(createFleetOctokit).not.toHaveBeenCalled();
    });

    it('creates app-based Octokit when auth=app', async () => {
      const args = {
        json: JSON.stringify({
          owner: 'testowner',
          repoName: 'testrepo',
          auth: 'app',
        }),
      };

      const ctx = await resolveInitContext(args, noopEmit);
      const { createFleetOctokit } = await import('../shared/auth/octokit.js');
      expect(createFleetOctokit).toHaveBeenCalled();
    });
  });

  describe('headless path (non-interactive)', () => {
    it('delegates to validateHeadlessInputs and returns context', async () => {
      const { validateHeadlessInputs } = await import('../init/wizard/index.js');
      vi.mocked(validateHeadlessInputs).mockResolvedValue({
        owner: 'headless-owner',
        repo: 'headless-repo',
        baseBranch: 'main',
        authMethod: 'token',
        secretsToUpload: {},
        dryRun: false,
        overwrite: false,
        intervalMinutes: 360,
      });

      const args = { 'non-interactive': true };
      const ctx = assertSuccess(await resolveInitContext(args, noopEmit));
      expect(ctx.input.owner).toBe('headless-owner');
      expect(ctx.input.repoName).toBe('headless-repo');
    });

    it('includes auto-detected secrets in headless path', async () => {
      process.env.JULES_API_KEY = 'sk-headless';
      const { validateHeadlessInputs } = await import('../init/wizard/index.js');
      vi.mocked(validateHeadlessInputs).mockResolvedValue({
        owner: 'owner',
        repo: 'repo',
        baseBranch: 'main',
        authMethod: 'token',
        secretsToUpload: {},
        dryRun: false,
        overwrite: false,
        intervalMinutes: 360,
      });

      const args = { 'non-interactive': true };
      const ctx = assertSuccess(await resolveInitContext(args, noopEmit));
      expect(ctx.secrets.JULES_API_KEY).toBe('sk-headless');
    });
  });

  describe('wizard path (interactive)', () => {
    it('delegates to runInitWizard and returns context', async () => {
      // Make isInteractive return true so the wizard path is chosen
      const { isInteractive } = await import('../shared/ui/index.js');
      vi.mocked(isInteractive).mockReturnValue(true);

      const { runInitWizard } = await import('../init/wizard/index.js');
      vi.mocked(runInitWizard).mockResolvedValue({
        owner: 'wizard-owner',
        repo: 'wizard-repo',
        baseBranch: 'develop',
        authMethod: 'app',
        secretsToUpload: { JULES_API_KEY: 'sk-wizard' },
        dryRun: false,
        overwrite: true,
        intervalMinutes: 120,
      });

      // Neither --json nor --non-interactive → wizard path
      const args = {} as Record<string, any>;
      const ctx = assertSuccess(await resolveInitContext(args, noopEmit));
      expect(ctx.input.owner).toBe('wizard-owner');
      expect(ctx.input.repoName).toBe('wizard-repo');
      expect(ctx.input.baseBranch).toBe('develop');

      vi.mocked(isInteractive).mockReturnValue(false);
    });

    it('uses wizard-collected secrets (merged with env)', async () => {
      const { isInteractive } = await import('../shared/ui/index.js');
      vi.mocked(isInteractive).mockReturnValue(true);

      process.env.FLEET_APP_ID = 'env-app-id';
      const { runInitWizard } = await import('../init/wizard/index.js');
      vi.mocked(runInitWizard).mockResolvedValue({
        owner: 'owner',
        repo: 'repo',
        baseBranch: 'main',
        authMethod: 'app',
        secretsToUpload: { JULES_API_KEY: 'sk-wizard' },
        dryRun: false,
        overwrite: false,
        intervalMinutes: 360,
      });

      const ctx = assertSuccess(await resolveInitContext({} as Record<string, any>, noopEmit));
      // Wizard secrets win over env-detected secrets
      expect(ctx.secrets.JULES_API_KEY).toBe('sk-wizard');
      // Env-detected secrets are also included (if not overridden by wizard)
      expect(ctx.secrets.FLEET_APP_ID).toBe('env-app-id');

      vi.mocked(isInteractive).mockReturnValue(false);
    });
  });

  describe('error handling', () => {
    it('propagates headless failure as-is', async () => {
      const { validateHeadlessInputs } = await import('../init/wizard/index.js');
      vi.mocked(validateHeadlessInputs).mockResolvedValue({
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'Missing repository.',
          recoverable: true,
        },
      } as any);

      const result = await resolveInitContext({ 'non-interactive': true } as Record<string, any>, noopEmit);
      expect(result).toHaveProperty('success', false);
    });
  });
});
