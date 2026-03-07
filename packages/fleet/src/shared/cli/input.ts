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



// ── SHARED INPUT ARGS ──────────────────────────────────────────────

/**
 * Common args for JSON input. Spread into any command's `args` definition
 * alongside `outputArgs` for full agent-friendly IO.
 */
export const inputArgs = {
  json: {
    type: 'string' as const,
    description: 'JSON payload matching the command schema. Replaces individual flags.',
  },
} as const;

// ── RESOLVE INPUT ──────────────────────────────────────────────────

/**
 * Parse input from either a `--json` string or flag-built object through a Zod schema.
 *
 * - `--json` takes precedence when provided (agent path).
 * - Falls back to `flagInput` (human path).
 * - Both paths go through the same Zod validation.
 *
 * @param schema - Zod schema to validate against
 * @param json - Raw JSON string from `--json` flag (agent input)
 * @param flagInput - Object built from individual CLI flags (human input)
 * @returns Parsed and validated input
 */
export function resolveInput<T>(
  schema: { parse(data: unknown): T },
  json?: string,
  flagInput?: Record<string, unknown>,
): T {
  const raw = json ? JSON.parse(json) : flagInput;
  return schema.parse(raw);
}
