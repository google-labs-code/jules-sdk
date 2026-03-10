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

describe('getAuthOptions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear all auth-related vars
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.FLEET_APP_ID;
    delete process.env.FLEET_APP_PRIVATE_KEY_BASE64;
    delete process.env.FLEET_APP_PRIVATE_KEY;
    delete process.env.FLEET_APP_INSTALLATION_ID;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('Cycle 1: returns token auth when GITHUB_TOKEN is set', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test_token_123';

    const { getAuthOptions } = await import('../../shared/auth.js');
    const opts = getAuthOptions();

    expect(opts).toBeDefined();
    expect(opts!.auth).toBe('ghp_test_token_123');
  });

  it('Cycle 2: throws when no credentials are set', async () => {
    const { getAuthOptions } = await import('../../shared/auth.js');

    expect(() => getAuthOptions()).toThrow('GitHub auth not configured');
  });

  it('Cycle 3: FLEET_APP_* provides App auth', async () => {
    process.env.FLEET_APP_ID = '12345';
    process.env.FLEET_APP_PRIVATE_KEY_BASE64 = Buffer.from(
      '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----',
    ).toString('base64');
    process.env.FLEET_APP_INSTALLATION_ID = '67890';

    const { getAuthOptions } = await import('../../shared/auth.js');
    const opts = getAuthOptions();

    expect(opts!.authStrategy).toBeDefined();
    expect((opts!.auth as any).appId).toBe('12345');
    expect((opts!.auth as any).installationId).toBe(67890);
  });

  it('Cycle 4: partial App config (missing key) throws diagnostic', async () => {
    process.env.FLEET_APP_ID = '12345';
    process.env.FLEET_APP_INSTALLATION_ID = '67890';

    const { getAuthOptions } = await import('../../shared/auth.js');

    expect(() => getAuthOptions()).toThrow('partially configured');
  });

  it('Cycle 5: partial App config (missing installation ID) throws diagnostic', async () => {
    process.env.FLEET_APP_ID = '12345';
    process.env.FLEET_APP_PRIVATE_KEY_BASE64 = Buffer.from(
      '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----',
    ).toString('base64');

    const { getAuthOptions } = await import('../../shared/auth.js');

    expect(() => getAuthOptions()).toThrow('FLEET_APP_INSTALLATION_ID');
  });

  it('Cycle 6: GH_TOKEN fallback works', async () => {
    process.env.GH_TOKEN = 'gh_cli_token';

    const { getAuthOptions } = await import('../../shared/auth.js');
    const opts = getAuthOptions();

    expect(opts!.auth).toBe('gh_cli_token');
  });

  it('Cycle 7: GITHUB_APP_* legacy vars accepted with deprecation warning', async () => {
    process.env.FLEET_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = Buffer.from(
      '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----',
    ).toString('base64');
    process.env.FLEET_APP_INSTALLATION_ID = '67890';

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

    const { getAuthOptions } = await import('../../shared/auth.js');
    const opts = getAuthOptions();

    expect(opts!.authStrategy).toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('legacy env var'),
    );
    warnSpy.mockRestore();
  });

  it('Cycle 8: FLEET_APP_PRIVATE_KEY_BASE64 is preferred over legacy names', async () => {
    process.env.FLEET_APP_ID = '12345';
    process.env.FLEET_APP_PRIVATE_KEY_BASE64 = Buffer.from(
      '-----BEGIN RSA PRIVATE KEY-----\ncanonical\n-----END RSA PRIVATE KEY-----',
    ).toString('base64');
    process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = Buffer.from(
      '-----BEGIN RSA PRIVATE KEY-----\nlegacy\n-----END RSA PRIVATE KEY-----',
    ).toString('base64');
    process.env.FLEET_APP_INSTALLATION_ID = '67890';

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

    const { getAuthOptions } = await import('../../shared/auth.js');
    const opts = getAuthOptions();

    // Should NOT warn because canonical name was used
    expect(warnSpy).not.toHaveBeenCalled();
    // Key should contain 'canonical'
    expect((opts!.auth as any).privateKey).toContain('canonical');
    warnSpy.mockRestore();
  });
});
