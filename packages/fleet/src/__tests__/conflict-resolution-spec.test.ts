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
import { ConflictResolutionInputSchema, CONFLICT_NOTIFICATION_TAG } from '../merge/conflict-resolution/spec.js';

describe('ConflictResolutionInputSchema', () => {
  const validInput = {
    owner: 'davideast',
    repo: 'jules-sdk-python',
    baseBranch: 'main',
    conflictingPR: {
      number: 114,
      branchName: 'fix-105-inspect-activity-15481661885092594092',
    },
    conflictingFiles: ['src/jules/__init__.py'],
  };

  it('accepts valid input with defaults', () => {
    const result = ConflictResolutionInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.peerPRs).toEqual([]);
      expect(result.data.maxNotifications).toBe(3);
    }
  });

  it('accepts custom maxNotifications', () => {
    const result = ConflictResolutionInputSchema.safeParse({
      ...validInput,
      maxNotifications: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxNotifications).toBe(5);
    }
  });

  it('accepts peer PRs', () => {
    const result = ConflictResolutionInputSchema.safeParse({
      ...validInput,
      peerPRs: [{ number: 115, files: ['src/jules/__init__.py'] }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.peerPRs).toHaveLength(1);
    }
  });

  it('rejects empty owner', () => {
    const result = ConflictResolutionInputSchema.safeParse({
      ...validInput,
      owner: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty repo', () => {
    const result = ConflictResolutionInputSchema.safeParse({
      ...validInput,
      repo: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty conflictingFiles array', () => {
    const result = ConflictResolutionInputSchema.safeParse({
      ...validInput,
      conflictingFiles: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative PR number', () => {
    const result = ConflictResolutionInputSchema.safeParse({
      ...validInput,
      conflictingPR: { ...validInput.conflictingPR, number: -1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty branch name', () => {
    const result = ConflictResolutionInputSchema.safeParse({
      ...validInput,
      conflictingPR: { ...validInput.conflictingPR, branchName: '' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero maxNotifications', () => {
    const result = ConflictResolutionInputSchema.safeParse({
      ...validInput,
      maxNotifications: 0,
    });
    expect(result.success).toBe(false);
  });

  it('defaults baseBranch to main', () => {
    const { baseBranch, ...withoutBase } = validInput;
    const result = ConflictResolutionInputSchema.safeParse(withoutBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseBranch).toBe('main');
    }
  });
});

describe('CONFLICT_NOTIFICATION_TAG', () => {
  it('is a non-empty string', () => {
    expect(CONFLICT_NOTIFICATION_TAG.length).toBeGreaterThan(0);
  });

  it('is an HTML comment', () => {
    expect(CONFLICT_NOTIFICATION_TAG).toMatch(/^<!--.*-->$/);
  });
});
