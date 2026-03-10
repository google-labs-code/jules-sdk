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
 * Resolve a private key from environment variable input.
 *
 * Accepts two formats:
 *   1. Raw PEM (with real newlines or literal \n strings)
 *   2. Base64-encoded PEM (`base64 < key.pem | tr -d '\n'`)
 *
 * Auto-detects the format: if the value starts with `-----BEGIN`,
 * it's treated as raw PEM regardless of the env var name.
 */
export function resolvePrivateKey(
  base64Value: string | undefined,
  rawValue: string | undefined,
): string {
  const value = base64Value || rawValue;
  if (!value) {
    throw new Error(
      'No private key provided. Set FLEET_APP_PRIVATE_KEY_BASE64 (recommended).',
    );
  }

  // Auto-detect: if it looks like PEM, use it directly
  if (value.trimStart().startsWith('-----BEGIN')) {
    return value.replace(/\\n/g, '\n');
  }

  // Otherwise, treat as base64
  return Buffer.from(value, 'base64').toString('utf-8');
}
