import { vi } from 'vitest';
import type { Platform } from '@google/jules-sdk';

export function createMockPlatform(): Platform {
  return {
    saveFile: vi.fn(),
    sleep: vi.fn(),
    createDataUrl: vi.fn(),
    fetch: vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: <T = any>() => Promise.resolve({} as T),
        text: () => Promise.resolve(''),
      }),
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
