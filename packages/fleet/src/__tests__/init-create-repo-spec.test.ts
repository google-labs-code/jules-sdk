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
import { InitInputSchema, InitErrorCode } from '../init/spec.js';

describe('InitInputSchema — createRepo fields', () => {
  const baseInput = {
    owner: 'test-org',
    repoName: 'test-repo',
    baseBranch: 'main',
  };

  it('defaults createRepo to false', () => {
    const result = InitInputSchema.parse(baseInput);
    expect(result.createRepo).toBe(false);
  });

  it('accepts createRepo: true', () => {
    const result = InitInputSchema.parse({ ...baseInput, createRepo: true });
    expect(result.createRepo).toBe(true);
  });

  it('defaults visibility to private', () => {
    const result = InitInputSchema.parse({ ...baseInput, createRepo: true });
    expect(result.visibility).toBe('private');
  });

  it('accepts visibility: public', () => {
    const result = InitInputSchema.parse({ ...baseInput, createRepo: true, visibility: 'public' });
    expect(result.visibility).toBe('public');
  });

  it('rejects invalid visibility value', () => {
    expect(() =>
      InitInputSchema.parse({ ...baseInput, visibility: 'internal' }),
    ).toThrow();
  });

  it('accepts optional description', () => {
    const result = InitInputSchema.parse({ ...baseInput, createRepo: true, description: 'My repo' });
    expect(result.description).toBe('My repo');
  });

  it('description is undefined by default', () => {
    const result = InitInputSchema.parse(baseInput);
    expect(result.description).toBeUndefined();
  });
});

describe('InitErrorCode — REPO_CREATE_FAILED', () => {
  it('includes REPO_CREATE_FAILED in error codes', () => {
    const result = InitErrorCode.parse('REPO_CREATE_FAILED');
    expect(result).toBe('REPO_CREATE_FAILED');
  });
});
