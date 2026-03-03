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
import { extractSessionId } from '../merge/ops/extract-session-id.js';

describe('extractSessionId', () => {
  it('extracts session ID from a standard Jules branch name', () => {
    expect(
      extractSessionId('fix-65-66-resolve-conflicts-15481661885092594092'),
    ).toBe('15481661885092594092');
  });

  it('extracts session ID from a short branch name', () => {
    expect(extractSessionId('fix-3-api-2184426524618245113')).toBe(
      '2184426524618245113',
    );
  });

  it('extracts session ID with single issue reference', () => {
    expect(
      extractSessionId('fix-issue-37-julesapierror-2856970561305386981'),
    ).toBe('2856970561305386981');
  });

  it('returns null for a non-Jules branch', () => {
    expect(extractSessionId('feat/my-feature')).toBeNull();
  });

  it('returns null for a branch with only short numbers', () => {
    expect(extractSessionId('fix-issue-42')).toBeNull();
  });

  it('returns null for main/master branches', () => {
    expect(extractSessionId('main')).toBeNull();
    expect(extractSessionId('master')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractSessionId('')).toBeNull();
  });

  it('returns null for branches ending in non-numeric segments', () => {
    expect(extractSessionId('chore/disable-cron')).toBeNull();
  });

  it('handles branch with origin/ prefix by ignoring it', () => {
    // The branch name passed should not have origin/ prefix,
    // but test robustness
    expect(
      extractSessionId(
        'origin/fix-65-66-resolve-conflicts-15481661885092594092',
      ),
    ).toBe('15481661885092594092');
  });
});
