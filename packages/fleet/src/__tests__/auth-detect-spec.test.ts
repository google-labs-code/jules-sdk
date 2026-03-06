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
import { AuthDetectInputSchema } from '../init/auth-detect/spec.js';

describe('AuthDetectInputSchema', () => {
  it('parses valid input with owner and repo', () => {
    const result = AuthDetectInputSchema.safeParse({
      owner: 'octocat',
      repo: 'hello-world',
    });
    expect(result.success).toBe(true);
  });

  it('parses valid input with preferredMethod', () => {
    const result = AuthDetectInputSchema.safeParse({
      owner: 'octocat',
      repo: 'hello-world',
      preferredMethod: 'app',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preferredMethod).toBe('app');
    }
  });

  it('rejects empty owner', () => {
    const result = AuthDetectInputSchema.safeParse({
      owner: '',
      repo: 'hello-world',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty repo', () => {
    const result = AuthDetectInputSchema.safeParse({
      owner: 'octocat',
      repo: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid preferredMethod', () => {
    const result = AuthDetectInputSchema.safeParse({
      owner: 'octocat',
      repo: 'hello-world',
      preferredMethod: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});
