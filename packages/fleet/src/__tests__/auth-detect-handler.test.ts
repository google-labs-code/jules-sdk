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
import { AuthDetectHandler } from '../init/auth-detect/handler.js';

// Mock octokit
vi.mock('octokit', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    rest: {
      repos: {
        get: vi.fn().mockResolvedValue({
          data: { full_name: 'owner/repo' },
        }),
      },
      users: {
        getAuthenticated: vi.fn().mockResolvedValue({
          data: { login: 'testuser' },
        }),
      },
    },
  })),
}));

// Mock child_process for gh CLI
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock app auth (not used in token tests but needed for import)
vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn(),
}));

// Mock resolvePrivateKey to avoid real key parsing in tests
vi.mock('../../shared/auth/resolve-key.js', () => ({
  resolvePrivateKey: vi.fn().mockReturnValue('mock-pem-key'),
}));

describe('AuthDetectHandler', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    // Clean env before each test
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    delete process.env.FLEET_APP_ID;
    delete process.env.FLEET_APP_PRIVATE_KEY;
    delete process.env.FLEET_APP_PRIVATE_KEY_BASE64;
    delete process.env.FLEET_APP_INSTALLATION_ID;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    vi.clearAllMocks();
  });

  describe('env var detection', () => {
    it('detects GITHUB_TOKEN from env', async () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';
      const handler = new AuthDetectHandler();
      const result = await handler.execute({ owner: 'owner', repo: 'repo' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.method).toBe('token');
        expect(result.data.source).toBe('env');
        expect(result.data.identity).toBe('testuser');
      }
    });

    it('detects FLEET_APP_* from env', async () => {
      process.env.FLEET_APP_ID = '12345';
      process.env.FLEET_APP_PRIVATE_KEY = 'base64key';
      process.env.FLEET_APP_INSTALLATION_ID = '67890';
      const handler = new AuthDetectHandler();
      const result = await handler.execute({ owner: 'owner', repo: 'repo' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.method).toBe('app');
        expect(result.data.source).toBe('env');
      }
    });
  });

  describe('--auth flag gating', () => {
    it('--auth=app ignores GITHUB_TOKEN', async () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';
      // No app credentials set
      const handler = new AuthDetectHandler();
      const result = await handler.execute({
        owner: 'owner',
        repo: 'repo',
        preferredMethod: 'app',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_CREDENTIALS_FOUND');
        expect(result.error.message).toContain('app auth');
      }
    });

    it('--auth=token ignores FLEET_APP_* vars', async () => {
      process.env.FLEET_APP_ID = '12345';
      process.env.FLEET_APP_PRIVATE_KEY = 'base64key';
      process.env.FLEET_APP_INSTALLATION_ID = '67890';
      // No GITHUB_TOKEN set, but gh CLI not available either
      const { execSync } = await import('node:child_process');
      vi.mocked(execSync).mockImplementation(() => { throw new Error('gh not found'); });

      const handler = new AuthDetectHandler();
      const result = await handler.execute({
        owner: 'owner',
        repo: 'repo',
        preferredMethod: 'token',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_CREDENTIALS_FOUND');
      }
    });
  });

  describe('gh CLI fallback', () => {
    it('falls back to gh auth token when no GITHUB_TOKEN in env', async () => {
      const { execSync } = await import('node:child_process');
      vi.mocked(execSync).mockReturnValue('ghp_from_gh_cli\n');

      const handler = new AuthDetectHandler();
      const result = await handler.execute({ owner: 'owner', repo: 'repo' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.method).toBe('token');
        expect(result.data.source).toBe('gh-cli');
      }
    });

    it('skips gh CLI silently when gh is not installed', async () => {
      const { execSync } = await import('node:child_process');
      vi.mocked(execSync).mockImplementation(() => { throw new Error('command not found'); });

      const handler = new AuthDetectHandler();
      const result = await handler.execute({ owner: 'owner', repo: 'repo' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_CREDENTIALS_FOUND');
      }
    });
  });

  describe('alternatives for wizard', () => {
    it('returns alternatives when both token and app are detected without preference', async () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';
      process.env.FLEET_APP_ID = '12345';
      process.env.FLEET_APP_PRIVATE_KEY = 'base64key';
      process.env.FLEET_APP_INSTALLATION_ID = '67890';

      const handler = new AuthDetectHandler();
      const result = await handler.execute({ owner: 'owner', repo: 'repo' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.alternatives).toBeDefined();
        expect(result.data.alternatives).toHaveLength(2);
        expect(result.data.alternatives![0].method).toBe('app');
        expect(result.data.alternatives![1].method).toBe('token');
      }
    });

    it('does not return alternatives when preferredMethod is set', async () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';
      process.env.FLEET_APP_ID = '12345';
      process.env.FLEET_APP_PRIVATE_KEY = 'base64key';
      process.env.FLEET_APP_INSTALLATION_ID = '67890';

      const handler = new AuthDetectHandler();
      const result = await handler.execute({
        owner: 'owner',
        repo: 'repo',
        preferredMethod: 'token',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.alternatives).toBeUndefined();
      }
    });
  });

  describe('health check failures', () => {
    it('returns HEALTH_CHECK_FAILED on 401', async () => {
      process.env.GITHUB_TOKEN = 'ghp_expired';
      const { Octokit } = await import('octokit');
      vi.mocked(Octokit).mockImplementation(() => ({
        rest: {
          repos: {
            get: vi.fn().mockRejectedValue(Object.assign(new Error('Bad credentials'), { status: 401 })),
          },
          users: { getAuthenticated: vi.fn() },
        },
      }) as any);

      const handler = new AuthDetectHandler();
      const result = await handler.execute({ owner: 'owner', repo: 'repo' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('HEALTH_CHECK_FAILED');
        expect(result.error.details?.httpStatus).toBe(401);
        expect(result.error.suggestion).toContain('invalid or expired');
      }
    });

    it('returns HEALTH_CHECK_FAILED on 404', async () => {
      process.env.GITHUB_TOKEN = 'ghp_valid';
      const { Octokit } = await import('octokit');
      vi.mocked(Octokit).mockImplementation(() => ({
        rest: {
          repos: {
            get: vi.fn().mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 })),
          },
          users: { getAuthenticated: vi.fn() },
        },
      }) as any);

      const handler = new AuthDetectHandler();
      const result = await handler.execute({ owner: 'owner', repo: 'repo' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('HEALTH_CHECK_FAILED');
        expect(result.error.details?.httpStatus).toBe(404);
        expect(result.error.suggestion).toContain('not found');
      }
    });
  });

  describe('no credentials', () => {
    it('returns NO_CREDENTIALS_FOUND when nothing is available', async () => {
      const { execSync } = await import('node:child_process');
      vi.mocked(execSync).mockImplementation(() => { throw new Error('not found'); });

      const handler = new AuthDetectHandler();
      const result = await handler.execute({ owner: 'owner', repo: 'repo' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_CREDENTIALS_FOUND');
        expect(result.error.recoverable).toBe(true);
      }
    });
  });
});
