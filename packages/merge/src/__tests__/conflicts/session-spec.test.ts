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
import { SessionCheckInputSchema } from '../../conflicts/session-spec.js';

describe('SessionCheckInputSchema', () => {
  const validInput = {
    sessionId: 'session-123',
    repo: 'owner/repo',
    base: 'main',
  };

  it('accepts valid input', () => {
    const result = SessionCheckInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('defaults base to main', () => {
    const result = SessionCheckInputSchema.safeParse({
      sessionId: 'session-123',
      repo: 'owner/repo',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.base).toBe('main');
    }
  });

  const invalidCases = [
    {
      name: 'rejects empty sessionId',
      input: { ...validInput, sessionId: '' },
    },
    {
      name: 'rejects empty repo',
      input: { ...validInput, repo: '' },
    },
    {
      name: 'rejects repo without /',
      input: { ...validInput, repo: 'noslash' },
    },
  ];

  it.each(invalidCases)('$name', ({ input }) => {
    const result = SessionCheckInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
