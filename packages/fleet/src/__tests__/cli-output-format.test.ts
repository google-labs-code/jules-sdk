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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  OutputFormatSchema,
  resolveOutputFormat,
  renderResult,
} from '../shared/cli/output.js';

// ── Contract Tests: OutputFormatSchema ──────────────────────────────

describe('OutputFormatSchema', () => {
  it('defaults to text', () => {
    const result = OutputFormatSchema.parse(undefined);
    expect(result).toBe('text');
  });

  it('accepts json', () => {
    const result = OutputFormatSchema.parse('json');
    expect(result).toBe('json');
  });

  it('rejects invalid format', () => {
    expect(() => OutputFormatSchema.parse('xml')).toThrow();
  });
});

// ── Contract Tests: resolveOutputFormat ─────────────────────────────

describe('resolveOutputFormat', () => {
  const originalEnv = process.env.OUTPUT_FORMAT;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OUTPUT_FORMAT;
    } else {
      process.env.OUTPUT_FORMAT = originalEnv;
    }
  });

  it('returns text by default', () => {
    delete process.env.OUTPUT_FORMAT;
    expect(resolveOutputFormat({})).toBe('text');
  });

  it('prefers --output flag over env var', () => {
    process.env.OUTPUT_FORMAT = 'text';
    expect(resolveOutputFormat({ output: 'json' })).toBe('json');
  });

  it('falls back to OUTPUT_FORMAT env var', () => {
    process.env.OUTPUT_FORMAT = 'json';
    expect(resolveOutputFormat({})).toBe('json');
  });

  it('rejects invalid env var values', () => {
    process.env.OUTPUT_FORMAT = 'xml';
    expect(() => resolveOutputFormat({})).toThrow();
  });
});

// ── Contract Tests: renderResult ────────────────────────────────────

describe('renderResult', () => {
  const successResult = {
    success: true as const,
    data: { id: 42, url: 'https://example.com', extra: 'value' },
  };

  const errorResult = {
    success: false as const,
    error: {
      code: 'GITHUB_API_ERROR',
      message: 'Not found',
      recoverable: true,
    },
  };

  it('returns null for text format', () => {
    expect(renderResult(successResult, 'text')).toBeNull();
  });

  it('includes full success envelope', () => {
    const output = renderResult(successResult, 'json');
    const parsed = JSON.parse(output!);
    expect(parsed).toEqual({
      success: true,
      data: { id: 42, url: 'https://example.com', extra: 'value' },
    });
  });

  it('includes error envelope', () => {
    const output = renderResult(errorResult, 'json');
    const parsed = JSON.parse(output!);
    expect(parsed).toEqual({
      success: false,
      error: {
        code: 'GITHUB_API_ERROR',
        message: 'Not found',
        recoverable: true,
      },
    });
  });

  it('filters fields when specified', () => {
    const output = renderResult(successResult, 'json', 'id,url');
    const parsed = JSON.parse(output!);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ id: 42, url: 'https://example.com' });
    expect(parsed.data.extra).toBeUndefined();
  });

  it('returns empty data for non-existent fields', () => {
    const output = renderResult(successResult, 'json', 'nonexistent');
    const parsed = JSON.parse(output!);
    expect(parsed.data).toEqual({});
  });

  it('ignores fields on error result', () => {
    const output = renderResult(errorResult, 'json', 'code');
    const parsed = JSON.parse(output!);
    // Fields filtering only applies to success data, not error envelope
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('GITHUB_API_ERROR');
    expect(parsed.error.message).toBe('Not found');
  });
});
