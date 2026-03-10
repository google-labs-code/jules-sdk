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
import { getAuthOptions } from '../shared/auth/octokit.js';

const FAKE_PEM = '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----';
const FAKE_PEM_B64 = Buffer.from(FAKE_PEM).toString('base64');

describe('getAuthOptions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear ALL auth env vars
    delete process.env.FLEET_APP_ID;
    delete process.env.FLEET_APP_PRIVATE_KEY;
    delete process.env.FLEET_APP_PRIVATE_KEY_BASE64;
    delete process.env.FLEET_APP_INSTALLATION_ID;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Existing tests (preserved) ──────────────────────────────────────

  it('uses App auth when all GITHUB_APP_* env vars are set', () => {
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY = FAKE_PEM;
    process.env.GITHUB_APP_INSTALLATION_ID = '67890';

    const options = getAuthOptions();
    expect(options).toHaveProperty('authStrategy');
    expect(options).toHaveProperty('auth.appId', '12345');
    expect(options).toHaveProperty('auth.installationId', 67890);
  });

  it('uses App auth with GITHUB_APP_PRIVATE_KEY_BASE64', () => {
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = FAKE_PEM_B64;
    process.env.GITHUB_APP_INSTALLATION_ID = '67890';

    const options = getAuthOptions();
    expect(options).toHaveProperty('authStrategy');
    expect(options).toHaveProperty('auth.privateKey', FAKE_PEM);
  });

  it('falls back to PAT when GITHUB_TOKEN is set', () => {
    process.env.GITHUB_TOKEN = 'ghp_fakepat123';

    const options = getAuthOptions();
    expect(options).toEqual({ auth: 'ghp_fakepat123' });
  });

  it('throws when no auth is configured', () => {
    expect(() => getAuthOptions()).toThrow('GitHub auth not configured');
  });

  // ── NEW: Canonical FLEET_APP_* names ────────────────────────────────

  it('uses App auth with canonical FLEET_APP_PRIVATE_KEY_BASE64', () => {
    process.env.FLEET_APP_ID = '12345';
    process.env.FLEET_APP_PRIVATE_KEY_BASE64 = FAKE_PEM_B64;
    process.env.FLEET_APP_INSTALLATION_ID = '67890';

    const options = getAuthOptions();
    expect(options).toHaveProperty('authStrategy');
    expect(options).toHaveProperty('auth.privateKey', FAKE_PEM);
  });

  // ── NEW: Legacy name deprecation warnings ───────────────────────────

  it('warns when using legacy FLEET_APP_PRIVATE_KEY', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
    process.env.FLEET_APP_ID = '12345';
    process.env.FLEET_APP_PRIVATE_KEY = FAKE_PEM_B64;
    process.env.FLEET_APP_INSTALLATION_ID = '67890';

    const options = getAuthOptions();
    expect(options).toHaveProperty('authStrategy');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('FLEET_APP_PRIVATE_KEY_BASE64'),
    );
  });

  it('warns when using legacy GITHUB_APP_PRIVATE_KEY_BASE64', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
    process.env.FLEET_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = FAKE_PEM_B64;
    process.env.FLEET_APP_INSTALLATION_ID = '67890';

    const options = getAuthOptions();
    expect(options).toHaveProperty('authStrategy');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('FLEET_APP_PRIVATE_KEY_BASE64'),
    );
  });

  // ── NEW: Partial App config → hard error ────────────────────────────

  it('throws on partial App config (ID set, key missing)', () => {
    process.env.FLEET_APP_ID = '12345';
    process.env.FLEET_APP_INSTALLATION_ID = '67890';
    // No key set — but GITHUB_TOKEN IS set
    process.env.GITHUB_TOKEN = 'ghp_fakepat123';

    // Should NOT silently fall back to token auth
    expect(() => getAuthOptions()).toThrow(/partial/i);
  });

  // ── NEW: GH_TOKEN fallback ──────────────────────────────────────────

  it('falls back to GH_TOKEN when GITHUB_TOKEN is not set', () => {
    process.env.GH_TOKEN = 'ghp_ghtoken456';

    const options = getAuthOptions();
    expect(options).toEqual({ auth: 'ghp_ghtoken456' });
  });

  // ── NEW: Auto-detect format ─────────────────────────────────────────

  it('resolves raw PEM stored in FLEET_APP_PRIVATE_KEY_BASE64', () => {
    // User accidentally stored raw PEM in the _BASE64 var — should still work
    process.env.FLEET_APP_ID = '12345';
    process.env.FLEET_APP_PRIVATE_KEY_BASE64 = FAKE_PEM;
    process.env.FLEET_APP_INSTALLATION_ID = '67890';

    const options = getAuthOptions();
    expect(options).toHaveProperty('authStrategy');
    expect(options).toHaveProperty('auth.privateKey', FAKE_PEM);
  });
});
