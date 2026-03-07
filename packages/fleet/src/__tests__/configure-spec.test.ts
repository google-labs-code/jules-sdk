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
import { ConfigureInputSchema } from '../configure/spec.js';

describe('ConfigureInputSchema (Contract Tests)', () => {
  it('accepts valid create labels input', () => {
    const result = ConfigureInputSchema.safeParse({
      resource: 'labels',
      action: 'create',
      owner: 'google',
      repo: 'sdk',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid delete labels input', () => {
    const result = ConfigureInputSchema.safeParse({
      resource: 'labels',
      action: 'delete',
      owner: 'google',
      repo: 'sdk',
    });
    expect(result.success).toBe(true);
  });

  it('defaults action to create', () => {
    const result = ConfigureInputSchema.safeParse({
      resource: 'labels',
      owner: 'google',
      repo: 'sdk',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe('create');
    }
  });

  it('rejects invalid resource', () => {
    const result = ConfigureInputSchema.safeParse({
      resource: 'invalid',
      owner: 'google',
      repo: 'sdk',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing owner', () => {
    const result = ConfigureInputSchema.safeParse({
      resource: 'labels',
      repo: 'sdk',
    });
    expect(result.success).toBe(false);
  });

  it('defaults auth to token', () => {
    const result = ConfigureInputSchema.safeParse({
      resource: 'secrets',
      owner: 'google',
      repo: 'sdk',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.auth).toBe('token');
    }
  });

  it('accepts auth=app', () => {
    const result = ConfigureInputSchema.safeParse({
      resource: 'secrets',
      owner: 'google',
      repo: 'sdk',
      auth: 'app',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.auth).toBe('app');
    }
  });

  it('rejects invalid auth value', () => {
    const result = ConfigureInputSchema.safeParse({
      resource: 'secrets',
      owner: 'google',
      repo: 'sdk',
      auth: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});
