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
import { parseFeatureFlags } from '../init/wizard/parse-features.js';
import type { InitArgs } from '../init/wizard/types.js';

describe('parseFeatureFlags', () => {
  describe('returns undefined when no feature flags provided', () => {
    it('empty args', () => {
      expect(parseFeatureFlags({} as InitArgs)).toBeUndefined();
    });

    it('only non-feature args', () => {
      expect(parseFeatureFlags({
        repo: 'owner/repo',
        base: 'main',
        'non-interactive': true,
      } as InitArgs)).toBeUndefined();
    });
  });

  describe('enable convention (flag present with empty string)', () => {
    it('--conflict-detection enables conflict-detection', () => {
      const result = parseFeatureFlags({ 'conflict-detection': '' } as InitArgs);
      expect(result).toEqual({ 'conflict-detection': true });
    });

    it('--auto-merge enables merge', () => {
      const result = parseFeatureFlags({ 'auto-merge': '' } as InitArgs);
      expect(result).toEqual({ merge: true });
    });

    it('--analyze enables analyze', () => {
      const result = parseFeatureFlags({ analyze: '' } as InitArgs);
      expect(result).toEqual({ analyze: true });
    });

    it('--dispatch enables dispatch', () => {
      const result = parseFeatureFlags({ dispatch: '' } as InitArgs);
      expect(result).toEqual({ dispatch: true });
    });
  });

  describe('disable convention (flag value is "disable")', () => {
    it('--conflict-detection=disable disables conflict-detection', () => {
      const result = parseFeatureFlags({ 'conflict-detection': 'disable' } as InitArgs);
      expect(result).toEqual({ 'conflict-detection': false });
    });

    it('--auto-merge=disable disables merge', () => {
      const result = parseFeatureFlags({ 'auto-merge': 'disable' } as InitArgs);
      expect(result).toEqual({ merge: false });
    });
  });

  describe('combined flags', () => {
    it('--auto-merge --conflict-detection enables both', () => {
      const result = parseFeatureFlags({
        'auto-merge': '',
        'conflict-detection': '',
      } as InitArgs);
      expect(result).toEqual({
        merge: true,
        'conflict-detection': true,
      });
    });

    it('--auto-merge --conflict-detection=disable enables merge, disables conflict-detection', () => {
      const result = parseFeatureFlags({
        'auto-merge': '',
        'conflict-detection': 'disable',
      } as InitArgs);
      expect(result).toEqual({
        merge: true,
        'conflict-detection': false,
      });
    });

    it('all four flags enabled', () => {
      const result = parseFeatureFlags({
        analyze: '',
        dispatch: '',
        'auto-merge': '',
        'conflict-detection': '',
      } as InitArgs);
      expect(result).toEqual({
        analyze: true,
        dispatch: true,
        merge: true,
        'conflict-detection': true,
      });
    });
  });

  describe('flag-to-key mapping', () => {
    it('--auto-merge maps to registry key "merge" (not "auto-merge")', () => {
      const result = parseFeatureFlags({ 'auto-merge': '' } as InitArgs);
      expect(result).toHaveProperty('merge');
      expect(result).not.toHaveProperty('auto-merge');
    });

    it('--conflict-detection maps to registry key "conflict-detection"', () => {
      const result = parseFeatureFlags({ 'conflict-detection': '' } as InitArgs);
      expect(result).toHaveProperty('conflict-detection');
    });
  });

  describe('non-"disable" string values are treated as enable', () => {
    it('--conflict-detection=anything is treated as enabled', () => {
      const result = parseFeatureFlags({ 'conflict-detection': 'anything' } as InitArgs);
      expect(result).toEqual({ 'conflict-detection': true });
    });

    it('only exact "disable" value removes the feature', () => {
      const result = parseFeatureFlags({ 'conflict-detection': 'disabled' } as InitArgs);
      expect(result).toEqual({ 'conflict-detection': true }); // 'disabled' !== 'disable'
    });
  });
});
