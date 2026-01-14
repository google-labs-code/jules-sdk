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

import { describe, vi, beforeEach, afterEach } from 'vitest';
import { NodePlatform } from '../../src/platform/node.js';
import { runPlatformTests } from './contract.js';

describe('NodePlatform', () => {
  // Mock global fetch
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.includes('/json')) {
        return new Response(JSON.stringify({ slideshow: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/status/404')) {
        return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 500 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  runPlatformTests(
    'Node.js',
    new NodePlatform(),
    (key: string, value: string) => {
      process.env[key] = value;
    },
  );
});
