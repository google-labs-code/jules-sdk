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

import { vi } from 'vitest';
import { Platform, PlatformResponse } from '../../src/platform/types.js';

export function createMockPlatform(): Platform {
  return {
    saveFile: vi.fn(),
    sleep: vi.fn(),
    createDataUrl: vi.fn(),
    fetch: vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      } as PlatformResponse),
    ),
    crypto: {
      randomUUID: vi.fn(() => 'mock-uuid'),
      sign: vi.fn(() => Promise.resolve('mock-signature')),
      verify: vi.fn(() => Promise.resolve(true)),
    },
    encoding: {
      base64Encode: vi.fn((text: string) =>
        Buffer.from(text).toString('base64url'),
      ),
      base64Decode: vi.fn((text: string) =>
        Buffer.from(text, 'base64url').toString('utf-8'),
      ),
    },
    getEnv: vi.fn(),
  };
}

export const mockPlatform: Platform = createMockPlatform();
