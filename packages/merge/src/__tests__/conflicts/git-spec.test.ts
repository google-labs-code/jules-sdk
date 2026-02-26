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
import { GitCheckInputSchema } from '../../conflicts/git-spec.js';

describe('GitCheckInputSchema', () => {
  const validInput = {
    repo: 'owner/repo',
    pullRequestNumber: 42,
    failingCommitSha: 'abc123def',
  };

  it('accepts valid input', () => {
    const result = GitCheckInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  const invalidCases = [
    {
      name: 'rejects pullRequestNumber <= 0',
      input: { ...validInput, pullRequestNumber: 0 },
    },
    {
      name: 'rejects empty failingCommitSha',
      input: { ...validInput, failingCommitSha: '' },
    },
    {
      name: 'rejects repo without /',
      input: { ...validInput, repo: 'noslash' },
    },
  ];

  it.each(invalidCases)('$name', ({ input }) => {
    const result = GitCheckInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
