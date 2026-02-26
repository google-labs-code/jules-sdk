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

describe('getAuthOptions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear all relevant vars
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses App auth when all App env vars are set', () => {
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----';
    process.env.GITHUB_APP_INSTALLATION_ID = '67890';

    const options = getAuthOptions();
    expect(options).toHaveProperty('authStrategy');
    expect(options).toHaveProperty('auth.appId', '12345');
    expect(options).toHaveProperty('auth.installationId', 67890);
  });

  it('uses App auth with base64 key when set', () => {
    const fakeKey = '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----';
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = Buffer.from(fakeKey).toString('base64');
    process.env.GITHUB_APP_INSTALLATION_ID = '67890';

    const options = getAuthOptions();
    expect(options).toHaveProperty('authStrategy');
    expect(options).toHaveProperty('auth.privateKey', fakeKey);
  });

  it('falls back to PAT when GITHUB_TOKEN is set', () => {
    process.env.GITHUB_TOKEN = 'ghp_fakepat123';

    const options = getAuthOptions();
    expect(options).toEqual({ auth: 'ghp_fakepat123' });
  });

  it('throws when no auth is configured', () => {
    expect(() => getAuthOptions()).toThrow('GitHub auth not configured');
  });
});
