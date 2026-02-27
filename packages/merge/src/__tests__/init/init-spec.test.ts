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
import { InitInputSchema } from '../../init/init-spec.js';

describe('InitInputSchema', () => {
  it('accepts valid input with all fields', () => {
    const result = InitInputSchema.safeParse({
      outputDir: '/tmp/repo',
      workflowName: 'my-check',
      baseBranch: 'develop',
      force: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outputDir).toBe('/tmp/repo');
      expect(result.data.workflowName).toBe('my-check');
      expect(result.data.baseBranch).toBe('develop');
      expect(result.data.force).toBe(true);
    }
  });

  it('applies defaults for optional fields', () => {
    const result = InitInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outputDir).toBe('.');
      expect(result.data.workflowName).toBe('jules-merge-check');
      expect(result.data.baseBranch).toBe('main');
      expect(result.data.force).toBe(false);
    }
  });

  const invalidCases = [
    {
      name: 'rejects empty outputDir',
      input: { outputDir: '' },
    },
    {
      name: 'rejects empty workflowName',
      input: { workflowName: '' },
    },
    {
      name: 'rejects empty baseBranch',
      input: { baseBranch: '' },
    },
  ];

  it.each(invalidCases)('$name', ({ input }) => {
    const result = InitInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
