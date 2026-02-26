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
import { AnalyzeInputSchema } from '../analyze/spec.js';

describe('AnalyzeInputSchema', () => {
  it('accepts valid input with goal', () => {
    const result = AnalyzeInputSchema.parse({
      goal: '.fleet/goals/example.md',
      owner: 'google',
      repo: 'jules-sdk',
    });
    expect(result.goal).toBe('.fleet/goals/example.md');
    expect(result.goalsDir).toBe('.fleet/goals');
    expect(result.baseBranch).toBe('main');
  });

  it('accepts valid input without goal (auto-discovery mode)', () => {
    const result = AnalyzeInputSchema.parse({
      owner: 'google',
      repo: 'jules-sdk',
    });
    expect(result.goal).toBeUndefined();
    expect(result.goalsDir).toBe('.fleet/goals');
  });

  it('accepts custom goalsDir', () => {
    const result = AnalyzeInputSchema.parse({
      goalsDir: 'custom/goals',
      owner: 'google',
      repo: 'jules-sdk',
    });
    expect(result.goalsDir).toBe('custom/goals');
  });

  it('accepts milestone', () => {
    const result = AnalyzeInputSchema.parse({
      goal: 'g.md',
      milestone: '42',
      owner: 'google',
      repo: 'jules-sdk',
    });
    expect(result.milestone).toBe('42');
  });

  it('rejects missing owner', () => {
    expect(() =>
      AnalyzeInputSchema.parse({ repo: 'r' }),
    ).toThrow();
  });

  it('rejects missing repo', () => {
    expect(() =>
      AnalyzeInputSchema.parse({ owner: 'o' }),
    ).toThrow();
  });
});
