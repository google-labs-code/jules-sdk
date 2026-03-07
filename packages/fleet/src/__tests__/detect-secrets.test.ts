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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectSecretsFromEnv } from '../init/ops/detect-secrets.js';

describe('detectSecretsFromEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clone env so we can mutate safely
    process.env = { ...originalEnv };
    // Clear all known secret env vars
    delete process.env.JULES_API_KEY;
    delete process.env.FLEET_APP_ID;
    delete process.env.GITHUB_APP_ID;
    delete process.env.FLEET_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
    delete process.env.FLEET_APP_INSTALLATION_ID;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns empty record when no env vars are set', () => {
    const secrets = detectSecretsFromEnv();
    expect(secrets).toEqual({});
  });

  it('detects JULES_API_KEY', () => {
    process.env.JULES_API_KEY = 'sk-test-key';
    const secrets = detectSecretsFromEnv();
    expect(secrets).toEqual({ JULES_API_KEY: 'sk-test-key' });
  });

  it('detects FLEET_APP_ID from FLEET_APP_ID env var', () => {
    process.env.FLEET_APP_ID = '12345';
    const secrets = detectSecretsFromEnv();
    expect(secrets).toEqual({ FLEET_APP_ID: '12345' });
  });

  it('falls back to GITHUB_APP_ID when FLEET_APP_ID is not set', () => {
    process.env.GITHUB_APP_ID = '67890';
    const secrets = detectSecretsFromEnv();
    expect(secrets).toEqual({ FLEET_APP_ID: '67890' });
  });

  it('prefers FLEET_APP_ID over GITHUB_APP_ID', () => {
    process.env.FLEET_APP_ID = 'fleet-id';
    process.env.GITHUB_APP_ID = 'github-id';
    const secrets = detectSecretsFromEnv();
    expect(secrets.FLEET_APP_ID).toBe('fleet-id');
  });

  it('detects FLEET_APP_PRIVATE_KEY from FLEET_APP_PRIVATE_KEY', () => {
    process.env.FLEET_APP_PRIVATE_KEY = 'base64-key';
    const secrets = detectSecretsFromEnv();
    expect(secrets).toEqual({ FLEET_APP_PRIVATE_KEY: 'base64-key' });
  });

  it('falls back to GITHUB_APP_PRIVATE_KEY_BASE64', () => {
    process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = 'github-base64-key';
    const secrets = detectSecretsFromEnv();
    expect(secrets).toEqual({ FLEET_APP_PRIVATE_KEY: 'github-base64-key' });
  });

  it('detects FLEET_APP_INSTALLATION_ID', () => {
    process.env.FLEET_APP_INSTALLATION_ID = 'install-123';
    const secrets = detectSecretsFromEnv();
    expect(secrets).toEqual({ FLEET_APP_INSTALLATION_ID: 'install-123' });
  });

  it('falls back to GITHUB_APP_INSTALLATION_ID', () => {
    process.env.GITHUB_APP_INSTALLATION_ID = 'github-install-456';
    const secrets = detectSecretsFromEnv();
    expect(secrets).toEqual({ FLEET_APP_INSTALLATION_ID: 'github-install-456' });
  });

  it('detects all secrets simultaneously', () => {
    process.env.JULES_API_KEY = 'sk-key';
    process.env.FLEET_APP_ID = 'app-id';
    process.env.FLEET_APP_PRIVATE_KEY = 'priv-key';
    process.env.FLEET_APP_INSTALLATION_ID = 'inst-id';
    const secrets = detectSecretsFromEnv();
    expect(secrets).toEqual({
      JULES_API_KEY: 'sk-key',
      FLEET_APP_ID: 'app-id',
      FLEET_APP_PRIVATE_KEY: 'priv-key',
      FLEET_APP_INSTALLATION_ID: 'inst-id',
    });
  });

  it('ignores empty string values', () => {
    process.env.JULES_API_KEY = '';
    process.env.FLEET_APP_ID = '';
    const secrets = detectSecretsFromEnv();
    expect(secrets).toEqual({});
  });

  it('filters to allowlist when provided', () => {
    process.env.JULES_API_KEY = 'sk-key';
    process.env.FLEET_APP_ID = 'app-id';
    process.env.FLEET_APP_PRIVATE_KEY = 'priv-key';
    process.env.FLEET_APP_INSTALLATION_ID = 'inst-id';
    const secrets = detectSecretsFromEnv(['JULES_API_KEY']);
    expect(secrets).toEqual({ JULES_API_KEY: 'sk-key' });
  });

  it('returns all secrets when allowlist is undefined', () => {
    process.env.JULES_API_KEY = 'sk-key';
    process.env.FLEET_APP_ID = 'app-id';
    const secrets = detectSecretsFromEnv(undefined);
    expect(secrets).toEqual({ JULES_API_KEY: 'sk-key', FLEET_APP_ID: 'app-id' });
  });

  it('returns empty when allowlist is empty array', () => {
    process.env.JULES_API_KEY = 'sk-key';
    process.env.FLEET_APP_ID = 'app-id';
    const secrets = detectSecretsFromEnv([]);
    expect(secrets).toEqual({});
  });
});
