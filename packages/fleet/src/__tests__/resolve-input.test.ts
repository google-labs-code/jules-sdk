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
import { resolveInput } from '../shared/cli/input.js';
import { z } from 'zod';

const TestSchema = z.object({
  name: z.string().min(1),
  count: z.number().default(1),
  enabled: z.boolean().default(false),
});

describe('resolveInput', () => {
  it('parses JSON string through Zod schema', () => {
    const result = resolveInput(TestSchema, '{"name":"hello","count":5}');
    expect(result).toEqual({ name: 'hello', count: 5, enabled: false });
  });

  it('applies schema defaults to JSON input', () => {
    const result = resolveInput(TestSchema, '{"name":"hello"}');
    expect(result.count).toBe(1);
    expect(result.enabled).toBe(false);
  });

  it('falls back to flagInput when no JSON provided', () => {
    const result = resolveInput(TestSchema, undefined, { name: 'from-flags', count: 3 });
    expect(result).toEqual({ name: 'from-flags', count: 3, enabled: false });
  });

  it('throws on invalid JSON string', () => {
    expect(() => resolveInput(TestSchema, '{bad json}')).toThrow();
  });

  it('throws on schema validation failure', () => {
    expect(() => resolveInput(TestSchema, '{"name":""}')).toThrow();
  });

  it('JSON takes precedence over flagInput', () => {
    const result = resolveInput(
      TestSchema,
      '{"name":"from-json"}',
      { name: 'from-flags' },
    );
    expect(result.name).toBe('from-json');
  });
});
