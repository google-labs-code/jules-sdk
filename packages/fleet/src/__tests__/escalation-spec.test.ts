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
  ConflictEscalationInputSchema,
  ConflictEscalationErrorCode,
} from '../merge/escalation/spec.js';

describe('ConflictEscalationInputSchema', () => {
  const validInput = {
    owner: 'google-labs-code',
    repo: 'jules-sdk',
    prNumber: 42,
  };

  it('parses valid input with defaults', () => {
    const result = ConflictEscalationInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseBranch).toBe('main');
      expect(result.data.failureThreshold).toBe(3);
    }
  });

  it('accepts custom baseBranch and failureThreshold', () => {
    const result = ConflictEscalationInputSchema.safeParse({
      ...validInput,
      baseBranch: 'develop',
      failureThreshold: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseBranch).toBe('develop');
      expect(result.data.failureThreshold).toBe(5);
    }
  });

  it('rejects missing owner', () => {
    const result = ConflictEscalationInputSchema.safeParse({
      repo: 'jules-sdk',
      prNumber: 42,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing repo', () => {
    const result = ConflictEscalationInputSchema.safeParse({
      owner: 'google-labs-code',
      prNumber: 42,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing prNumber', () => {
    const result = ConflictEscalationInputSchema.safeParse({
      owner: 'google-labs-code',
      repo: 'jules-sdk',
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero failureThreshold', () => {
    const result = ConflictEscalationInputSchema.safeParse({
      ...validInput,
      failureThreshold: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative failureThreshold', () => {
    const result = ConflictEscalationInputSchema.safeParse({
      ...validInput,
      failureThreshold: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative prNumber', () => {
    const result = ConflictEscalationInputSchema.safeParse({
      ...validInput,
      prNumber: -5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty owner string', () => {
    const result = ConflictEscalationInputSchema.safeParse({
      owner: '',
      repo: 'jules-sdk',
      prNumber: 42,
    });
    expect(result.success).toBe(false);
  });
});

describe('ConflictEscalationErrorCode', () => {
  const validCodes = [
    'BELOW_THRESHOLD',
    'NO_CONFLICT_RUNS',
    'CHECK_RUNS_API_ERROR',
    'SESSION_DISPATCH_FAILED',
    'UNKNOWN_ERROR',
  ];

  it.each(validCodes)('accepts valid error code: %s', (code) => {
    const result = ConflictEscalationErrorCode.safeParse(code);
    expect(result.success).toBe(true);
  });

  it('rejects invalid error code', () => {
    const result = ConflictEscalationErrorCode.safeParse('INVALID');
    expect(result.success).toBe(false);
  });
});
