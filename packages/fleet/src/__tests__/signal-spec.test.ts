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
import { SignalCreateInputSchema, SignalKind } from '../signal/spec.js';

describe('SignalCreateInputSchema', () => {
  const validInput = {
    owner: 'google',
    repo: 'jules-sdk',
    title: 'Fix auth module',
    body: '### Objective\nFix the auth module',
  };

  it('accepts valid assessment input with defaults', () => {
    const result = SignalCreateInputSchema.parse(validInput);
    expect(result.kind).toBe('assessment');
    expect(result.tags).toEqual([]);
    expect(result.scope).toBeUndefined();
  });

  it('accepts valid insight input', () => {
    const result = SignalCreateInputSchema.parse({
      ...validInput,
      kind: 'insight',
    });
    expect(result.kind).toBe('insight');
  });

  it('accepts tags and scope', () => {
    const result = SignalCreateInputSchema.parse({
      ...validInput,
      tags: ['fleet', 'urgent'],
      scope: 'Sprint 5',
    });
    expect(result.tags).toEqual(['fleet', 'urgent']);
    expect(result.scope).toBe('Sprint 5');
  });

  it('rejects missing owner', () => {
    expect(() =>
      SignalCreateInputSchema.parse({ repo: 'r', title: 't', body: 'b' }),
    ).toThrow();
  });

  it('rejects missing repo', () => {
    expect(() =>
      SignalCreateInputSchema.parse({ owner: 'o', title: 't', body: 'b' }),
    ).toThrow();
  });

  it('rejects empty title', () => {
    expect(() =>
      SignalCreateInputSchema.parse({ ...validInput, title: '' }),
    ).toThrow();
  });

  it('rejects empty body', () => {
    expect(() =>
      SignalCreateInputSchema.parse({ ...validInput, body: '' }),
    ).toThrow();
  });

  it('rejects invalid kind', () => {
    expect(() =>
      SignalCreateInputSchema.parse({ ...validInput, kind: 'invalid' }),
    ).toThrow();
  });
});

describe('SignalKind', () => {
  it('accepts insight', () => {
    expect(SignalKind.parse('insight')).toBe('insight');
  });

  it('accepts assessment', () => {
    expect(SignalKind.parse('assessment')).toBe('assessment');
  });

  it('rejects unknown kind', () => {
    expect(() => SignalKind.parse('task')).toThrow();
  });
});
