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

import { describe, it, expect } from 'vitest';
import { InitInputSchema } from '../init/spec.js';

describe('InitInputSchema (Contract Tests)', () => {
  it('accepts valid input with explicit owner/repo', () => {
    const result = InitInputSchema.safeParse({
      owner: 'google',
      repoName: 'sdk',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseBranch).toBe('main');
    }
  });

  it('accepts valid repo format', () => {
    const result = InitInputSchema.safeParse({
      repo: 'google/sdk',
      owner: 'google',
      repoName: 'sdk',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid repo format', () => {
    const result = InitInputSchema.safeParse({
      repo: 'no-slash',
      owner: 'google',
      repoName: 'sdk',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty owner', () => {
    const result = InitInputSchema.safeParse({
      owner: '',
      repoName: 'sdk',
    });
    expect(result.success).toBe(false);
  });

  // ── Auth mode contract tests ──────────────────────────────

  it('accepts auth=app', () => {
    const result = InitInputSchema.safeParse({
      owner: 'google',
      repoName: 'sdk',
      auth: 'app',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.auth).toBe('app');
    }
  });

  it('accepts auth=token', () => {
    const result = InitInputSchema.safeParse({
      owner: 'google',
      repoName: 'sdk',
      auth: 'token',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.auth).toBe('token');
    }
  });

  it('defaults auth to token when omitted', () => {
    const result = InitInputSchema.safeParse({
      owner: 'google',
      repoName: 'sdk',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.auth).toBe('token');
    }
  });

  it('rejects unknown auth modes', () => {
    const result = InitInputSchema.safeParse({
      owner: 'google',
      repoName: 'sdk',
      auth: 'oauth',
    });
    expect(result.success).toBe(false);
  });
});
