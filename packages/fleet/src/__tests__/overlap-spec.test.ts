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

import { describe, test, expect } from 'bun:test';
import { OverlapInputSchema } from '../analyze/overlap/spec.js';

describe('OverlapInputSchema', () => {
  test('accepts valid input with issues', () => {
    const result = OverlapInputSchema.safeParse({
      issues: [
        { number: 1, targetFiles: ['src/client.py'] },
        { number: 2, targetFiles: ['src/models.py'] },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('rejects empty issues array', () => {
    const result = OverlapInputSchema.safeParse({
      issues: [],
    });
    expect(result.success).toBe(false);
  });

  test('rejects issues without number', () => {
    const result = OverlapInputSchema.safeParse({
      issues: [{ targetFiles: ['src/client.py'] }],
    });
    expect(result.success).toBe(false);
  });

  test('rejects issues with empty target files', () => {
    const result = OverlapInputSchema.safeParse({
      issues: [{ number: 1, targetFiles: [''] }],
    });
    expect(result.success).toBe(false);
  });

  test('rejects negative issue numbers', () => {
    const result = OverlapInputSchema.safeParse({
      issues: [{ number: -1, targetFiles: ['src/file.py'] }],
    });
    expect(result.success).toBe(false);
  });
});
