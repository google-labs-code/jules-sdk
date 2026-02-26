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
import { DispatchInputSchema } from '../dispatch/spec.js';

describe('DispatchInputSchema', () => {
  it('accepts valid input', () => {
    const result = DispatchInputSchema.parse({
      milestone: '1',
      owner: 'google',
      repo: 'jules-sdk',
    });
    expect(result.milestone).toBe('1');
    expect(result.baseBranch).toBe('main');
  });

  it('accepts custom base branch', () => {
    const result = DispatchInputSchema.parse({
      milestone: '1',
      owner: 'google',
      repo: 'jules-sdk',
      baseBranch: 'develop',
    });
    expect(result.baseBranch).toBe('develop');
  });

  it('rejects empty milestone', () => {
    expect(() =>
      DispatchInputSchema.parse({
        milestone: '',
        owner: 'google',
        repo: 'jules-sdk',
      }),
    ).toThrow();
  });

  it('rejects missing owner', () => {
    expect(() =>
      DispatchInputSchema.parse({
        milestone: '1',
        repo: 'r',
      }),
    ).toThrow();
  });

  it('rejects missing repo', () => {
    expect(() =>
      DispatchInputSchema.parse({
        milestone: '1',
        owner: 'o',
      }),
    ).toThrow();
  });
});
