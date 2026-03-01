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
import { FEATURE_REGISTRY } from '../init/features/registry.js';
import { FEATURE_KEYS } from '../init/features/spec.js';

describe('FEATURE_REGISTRY', () => {
  it('has an entry for every FeatureKey', () => {
    for (const key of FEATURE_KEYS) {
      expect(FEATURE_REGISTRY).toHaveProperty(key);
    }
  });

  it('every entry has a non-empty repoPath', () => {
    for (const key of FEATURE_KEYS) {
      expect(FEATURE_REGISTRY[key].repoPath).toBeTruthy();
      expect(typeof FEATURE_REGISTRY[key].repoPath).toBe('string');
    }
  });

  it('every entry has a non-empty content string', () => {
    for (const key of FEATURE_KEYS) {
      expect(FEATURE_REGISTRY[key].content).toBeTruthy();
      expect(typeof FEATURE_REGISTRY[key].content).toBe('string');
    }
  });

  it('every repoPath starts with .github/workflows/', () => {
    for (const key of FEATURE_KEYS) {
      expect(FEATURE_REGISTRY[key].repoPath).toMatch(
        /^\.github\/workflows\//,
      );
    }
  });

  it('no two features share the same repoPath', () => {
    const paths = FEATURE_KEYS.map((key) => FEATURE_REGISTRY[key].repoPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('has exactly 4 entries', () => {
    expect(Object.keys(FEATURE_REGISTRY)).toHaveLength(4);
  });
});
