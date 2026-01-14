/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect, vi } from 'vitest';
import { Platform } from '../../src/platform/types.js';

// RFC 4231 Test Vector (Case 2)
const TEST_KEY = 'Jefe';
const TEST_DATA = 'what do ya want for nothing?';
// We expect Base64Url encoding, not Hex
const EXPECTED_SIG = 'W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM';

export function runPlatformTests(
  platformName: string,
  platform: Platform,
  setupEnv?: (key: string, value: string) => void,
) {
  describe(`Platform Compliance: ${platformName}`, () => {
    if (setupEnv) {
      describe('Environment Subsystem', () => {
        it('retrieves environment variables', () => {
          const key = 'TEST_ENV_VAR';
          const value = 'test-value';
          setupEnv(key, value);
          expect(platform.getEnv(key)).toBe(value);
        });

        it('returns undefined for missing variables', () => {
          expect(platform.getEnv('NON_EXISTENT_VAR')).toBeUndefined();
        });
      });
    }

    describe('Crypto Subsystem', () => {
      it('generates valid UUIDs', () => {
        const uuid = platform.crypto.randomUUID();
        expect(uuid).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
      });

      it('signs data correctly (RFC 4231)', async () => {
        const sig = await platform.crypto.sign(TEST_DATA, TEST_KEY);
        expect(sig).toBe(EXPECTED_SIG);
      });

      it('verifies valid signatures', async () => {
        const isValid = await platform.crypto.verify(
          TEST_DATA,
          EXPECTED_SIG,
          TEST_KEY,
        );
        expect(isValid).toBe(true);
      });

      it('rejects tampered data', async () => {
        const isValid = await platform.crypto.verify(
          TEST_DATA + '!', // Tampered
          EXPECTED_SIG,
          TEST_KEY,
        );
        expect(isValid).toBe(false);
      });

      it('rejects wrong keys', async () => {
        const isValid = await platform.crypto.verify(
          TEST_DATA,
          EXPECTED_SIG,
          'WrongKey',
        );
        expect(isValid).toBe(false);
      });
    });

    describe('Network Subsystem', () => {
      // These tests assume the environment has mocked the underlying network primitive
      // (fetch for Node/Browser, UrlFetchApp for GAS)
      // to return a specific response for 'https://httpbin.org/json' and 'https://httpbin.org/status/404'

      it('fetches JSON successfully', async () => {
        const res = await platform.fetch('https://httpbin.org/json');
        expect(res.ok).toBe(true);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('slideshow');
      });

      it('handles 404s without throwing', async () => {
        const res = await platform.fetch('https://httpbin.org/status/404');
        expect(res.ok).toBe(false);
        expect(res.status).toBe(404);
      });
    });

    describe('Encoding Subsystem', () => {
      it('encodes strings to Base64URL', () => {
        const input = 'Hello World';
        // Base64 for "Hello World" is "SGVsbG8gV29ybGQ="
        // Base64URL strips padding '='
        const expected = 'SGVsbG8gV29ybGQ';
        expect(platform.encoding.base64Encode(input)).toBe(expected);
      });

      it('decodes Base64URL strings', () => {
        const input = 'SGVsbG8gV29ybGQ';
        const expected = 'Hello World';
        expect(platform.encoding.base64Decode(input)).toBe(expected);
      });

      it('handles URL-safe characters (- and _)', () => {
        // Standard Base64:  + and /
        // Base64URL:        - and _
        // Input that produces + and / in standard Base64:
        // "subjects?_d" -> "c3ViamVjdHM/X2Q="
        // "subjects?_d" -> URL Safe: "c3ViamVjdHM_X2Q"
        // Let's use a known vector:
        // \xff\xff -> "//8=" (standard) -> "__8" (URL Safe)
        // Since our interface takes strings, we rely on platform handling.
        // Let's try a string that results in + or /
        // ">>??" -> "Pj4/Pw==" -> "Pj4_Pw"
        const input = '>>??';
        const encoded = platform.encoding.base64Encode(input);
        expect(encoded).not.toContain('+');
        expect(encoded).not.toContain('/');
        expect(encoded).not.toContain('=');
        expect(platform.encoding.base64Decode(encoded)).toBe(input);
      });
    });
  });
}
