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

import { existsSync, readFileSync } from 'fs';

/**
 * Resolve a private key from flexible user input.
 *
 * Accepts three formats:
 *   1. File path (e.g. ~/Downloads/my-app.pem) — reads the file
 *   2. Raw PEM string (starts with -----BEGIN) — returned as-is
 *   3. Base64-encoded PEM — decoded and returned
 *
 * @param input - File path, PEM string, or base64 string
 * @returns The decoded PEM private key string
 */
export function resolvePrivateKeyFromInput(input: string): string {
  const trimmed = input.trim();

  // Check if it's a file path
  const expanded = trimmed.replace(/^~/, process.env.HOME || '');
  if (existsSync(expanded)) {
    const content = readFileSync(expanded, 'utf-8').trim();
    if (!content.includes('-----BEGIN')) {
      throw new Error(
        `File "${trimmed}" does not look like a PEM private key. Expected -----BEGIN RSA PRIVATE KEY----- or similar.`,
      );
    }
    return content;
  }

  // Check if it's a raw PEM string
  if (trimmed.startsWith('-----BEGIN')) {
    return trimmed.replace(/\\n/g, '\n');
  }

  // Assume base64-encoded PEM
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
    if (decoded.includes('-----BEGIN')) {
      return decoded;
    }
    throw new Error('Decoded value does not contain a PEM header.');
  } catch {
    throw new Error(
      'Could not parse private key. Provide a path to a .pem file, a raw PEM string, or a base64-encoded PEM.',
    );
  }
}
