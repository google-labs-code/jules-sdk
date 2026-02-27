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
import { TraceInputSchema } from '../trace/spec.js';

describe('TraceInputSchema', () => {
  test('accepts session entry point', () => {
    const result = TraceInputSchema.safeParse({
      sessionId: 'abc123',
      repo: 'owner/repo',
    });
    expect(result.success).toBe(true);
  });

  test('accepts issue entry point', () => {
    const result = TraceInputSchema.safeParse({
      issueNumber: 4,
      repo: 'owner/repo',
    });
    expect(result.success).toBe(true);
  });

  test('accepts milestone entry point', () => {
    const result = TraceInputSchema.safeParse({
      milestone: '1',
      repo: 'owner/repo',
    });
    expect(result.success).toBe(true);
  });

  test('accepts milestone by title', () => {
    const result = TraceInputSchema.safeParse({
      milestone: 'v1.0',
      repo: 'owner/repo',
    });
    expect(result.success).toBe(true);
  });

  test('rejects when no entry point is provided', () => {
    const result = TraceInputSchema.safeParse({
      repo: 'owner/repo',
    });
    expect(result.success).toBe(false);
  });

  test('rejects repo without slash', () => {
    const result = TraceInputSchema.safeParse({
      sessionId: 'abc123',
      repo: 'just-repo',
    });
    expect(result.success).toBe(false);
  });

  test('defaults format to json', () => {
    const result = TraceInputSchema.safeParse({
      sessionId: 'abc123',
      repo: 'owner/repo',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe('json');
    }
  });

  test('accepts md format', () => {
    const result = TraceInputSchema.safeParse({
      sessionId: 'abc123',
      repo: 'owner/repo',
      format: 'md',
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid format', () => {
    const result = TraceInputSchema.safeParse({
      sessionId: 'abc123',
      repo: 'owner/repo',
      format: 'xml',
    });
    expect(result.success).toBe(false);
  });

  test('rejects negative issue number', () => {
    const result = TraceInputSchema.safeParse({
      issueNumber: -1,
      repo: 'owner/repo',
    });
    expect(result.success).toBe(false);
  });

  test('accepts multiple entry points (session takes priority in handler)', () => {
    const result = TraceInputSchema.safeParse({
      sessionId: 'abc123',
      issueNumber: 4,
      repo: 'owner/repo',
    });
    expect(result.success).toBe(true);
  });
});
