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
import {
  FeatureReconcileInputSchema,
  FeatureKeySchema,
  FEATURE_KEYS,
} from '../init/features/spec.js';

describe('FeatureKeySchema', () => {
  it('accepts all known feature keys', () => {
    for (const key of FEATURE_KEYS) {
      expect(FeatureKeySchema.safeParse(key).success).toBe(true);
    }
  });

  it('rejects unknown feature keys', () => {
    expect(FeatureKeySchema.safeParse('unknown').success).toBe(false);
    expect(FeatureKeySchema.safeParse('').success).toBe(false);
    expect(FeatureKeySchema.safeParse(123).success).toBe(false);
  });

  it('includes exactly 4 known keys', () => {
    expect(FEATURE_KEYS).toHaveLength(4);
    expect(FEATURE_KEYS).toContain('analyze');
    expect(FEATURE_KEYS).toContain('dispatch');
    expect(FEATURE_KEYS).toContain('merge');
    expect(FEATURE_KEYS).toContain('conflict-detection');
  });
});

describe('FeatureReconcileInputSchema', () => {
  it('parses valid input with all features', () => {
    const result = FeatureReconcileInputSchema.safeParse({
      owner: 'google',
      repo: 'my-repo',
      desired: {
        'analyze': true,
        'dispatch': true,
        'merge': true,
        'conflict-detection': false,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.desired['conflict-detection']).toBe(false);
    }
  });

  it('parses valid input with partial features and applies defaults', () => {
    const result = FeatureReconcileInputSchema.safeParse({
      owner: 'google',
      repo: 'my-repo',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Should have defaults
      expect(result.data.desired).toBeDefined();
    }
  });

  it('parses valid input with explicit desired features', () => {
    const result = FeatureReconcileInputSchema.safeParse({
      owner: 'google',
      repo: 'my-repo',
      desired: { 'merge': false },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.desired['merge']).toBe(false);
    }
  });

  const invalidCases = [
    { desc: 'rejects empty owner', input: { owner: '', repo: 'r' } },
    { desc: 'rejects empty repo', input: { owner: 'o', repo: '' } },
    { desc: 'rejects missing owner', input: { repo: 'r' } },
    { desc: 'rejects missing repo', input: { owner: 'o' } },
  ];

  it.each(invalidCases)('$desc', ({ input }) => {
    expect(FeatureReconcileInputSchema.safeParse(input).success).toBe(false);
  });
});
