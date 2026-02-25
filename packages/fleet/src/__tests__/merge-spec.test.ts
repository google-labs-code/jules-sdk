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
import { MergeInputSchema } from '../merge/spec.js';

describe('MergeInputSchema (Contract Tests)', () => {
  describe('valid inputs', () => {
    it('accepts label mode with defaults', () => {
      const result = MergeInputSchema.safeParse({
        owner: 'google',
        repo: 'jules-sdk',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('label');
        expect(result.data.baseBranch).toBe('main');
        expect(result.data.admin).toBe(false);
        expect(result.data.maxCIWaitSeconds).toBe(600);
        expect(result.data.maxRetries).toBe(2);
        expect(result.data.pollTimeoutSeconds).toBe(900);
      }
    });

    it('accepts fleet-run mode with run ID', () => {
      const result = MergeInputSchema.safeParse({
        mode: 'fleet-run',
        runId: 'fleet-20260225-abc123',
        owner: 'google',
        repo: 'jules-sdk',
      });
      expect(result.success).toBe(true);
    });

    it('accepts label mode with custom timeouts', () => {
      const result = MergeInputSchema.safeParse({
        mode: 'label',
        baseBranch: 'develop',
        admin: true,
        maxCIWaitSeconds: 300,
        maxRetries: 5,
        owner: 'google',
        repo: 'jules-sdk',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.baseBranch).toBe('develop');
        expect(result.data.admin).toBe(true);
        expect(result.data.maxCIWaitSeconds).toBe(300);
        expect(result.data.maxRetries).toBe(5);
      }
    });
  });

  describe('invalid inputs', () => {
    it('rejects fleet-run mode without run ID', () => {
      const result = MergeInputSchema.safeParse({
        mode: 'fleet-run',
        owner: 'google',
        repo: 'jules-sdk',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('runId');
      }
    });

    it('rejects invalid mode value', () => {
      const result = MergeInputSchema.safeParse({
        mode: 'invalid',
        owner: 'google',
        repo: 'jules-sdk',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing owner', () => {
      const result = MergeInputSchema.safeParse({
        repo: 'jules-sdk',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty owner', () => {
      const result = MergeInputSchema.safeParse({
        owner: '',
        repo: 'jules-sdk',
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative maxRetries', () => {
      const result = MergeInputSchema.safeParse({
        maxRetries: -1,
        owner: 'google',
        repo: 'jules-sdk',
      });
      expect(result.success).toBe(false);
    });
  });
});
