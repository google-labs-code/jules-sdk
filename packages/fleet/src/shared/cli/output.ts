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

import { z } from 'zod';

// ── OUTPUT FORMAT ──────────────────────────────────────────────────

export const OutputFormatSchema = z.enum(['json', 'text']).default('text');
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

// ── SHARED CLI ARGS ────────────────────────────────────────────────

/**
 * Common args every command should spread into its `args` definition.
 * Provides `--output` and `--fields` flags.
 */
export const outputArgs = {
  output: {
    type: 'string' as const,
    description: 'Output format: json or text (default: text)',
    default: 'text',
  },
  fields: {
    type: 'string' as const,
    description: 'Comma-separated list of top-level fields to include in JSON output',
  },
} as const;

// ── RESOLVE FORMAT ─────────────────────────────────────────────────

/**
 * Resolve output format from `--output` flag or `OUTPUT_FORMAT` env var.
 * Flag takes precedence over env var. Defaults to `text`.
 */
export function resolveOutputFormat(args: { output?: string }): OutputFormat {
  const raw = args.output || process.env.OUTPUT_FORMAT || 'text';
  return OutputFormatSchema.parse(raw);
}

// ── RENDER RESULT ──────────────────────────────────────────────────

type SuccessResult<T> = { success: true; data: T };
type ErrorResult = { success: false; error: unknown };
type AnyResult<T> = SuccessResult<T> | ErrorResult;

/**
 * Render a handler Result as a JSON string, or return null for text format.
 *
 * Pure function — no side effects. The caller handles console.log().
 *
 * @param result - The handler Result (success or failure envelope)
 * @param format - Output format to render as
 * @param fields - Optional comma-separated field list to filter success data
 * @returns JSON string if format is 'json', null if 'text'
 */
export function renderResult<T>(
  result: AnyResult<T>,
  format: OutputFormat,
  fields?: string,
): string | null {
  if (format !== 'json') return null;

  // Apply field filtering only to success results
  if (fields && result.success) {
    const keys = fields.split(',').map((k) => k.trim());
    const filtered = Object.fromEntries(
      Object.entries(result.data as Record<string, unknown>).filter(([k]) =>
        keys.includes(k),
      ),
    );
    return JSON.stringify({ success: true, data: filtered }, null, 2);
  }

  return JSON.stringify(result, null, 2);
}
