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

/**
 * Parses the value of a --json <string> option.
 *
 * Returns the parsed object when given a valid JSON string.
 * Returns null when the flag was not provided (undefined) or was mistakenly
 * set to a boolean (which happens if the option is declared without <string>).
 * Throws on malformed JSON.
 */
export function parseJsonInput(
  jsonFlag: string | undefined,
): Record<string, unknown> | null {
  if (jsonFlag === undefined || typeof jsonFlag !== 'string') {
    return null;
  }
  return JSON.parse(jsonFlag);
}

/**
 * Signals a conflict or action-required state — exit code 1.
 * Use for recoverable situations (stale base SHA, pending hot zones).
 */
export class ConflictError extends Error {
  readonly exitCode = 1;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * Signals an unrecoverable error — exit code 2.
 * Use for missing manifests, invalid API responses, programmer errors.
 */
export class HardError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = 'HardError';
  }
}

/** Maps any thrown value to the correct process exit code. */
export function getExitCode(error: unknown): 1 | 2 {
  if (error instanceof ConflictError) return 1;
  return 2;
}
