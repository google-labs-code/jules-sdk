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

import { describe, test, expect, vi, afterEach } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { getRootDir, isWritable } from '../../src/storage/root.js';

vi.mock('node:os');
vi.mock('node:fs');

describe('getRootDir', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetAllMocks();
  });

  test('returns JULES_HOME when set and writable', () => {
    process.env.JULES_HOME = '/tmp/jules-test';
    // Mock isWritable check indirectly by mocking fs.accessSync
    vi.mocked(fs.accessSync).mockImplementation(() => {});

    expect(getRootDir()).toBe('/tmp/jules-test');
  });

  test('falls back to HOME when JULES_HOME not set', () => {
    delete process.env.JULES_HOME;
    process.env.HOME = '/Users/testuser';
    vi.mocked(fs.accessSync).mockImplementation(() => {});

    expect(getRootDir()).toBe('/Users/testuser');
  });

  test('falls back to os.homedir() when HOME is invalid', () => {
    delete process.env.JULES_HOME;
    delete process.env.HOME;
    vi.mocked(os.homedir).mockReturnValue('/home/os-user');
    vi.mocked(fs.accessSync).mockImplementation(() => {});

    expect(getRootDir()).toBe('/home/os-user');
  });

  test('uses TMPDIR as last resort when all else fails', () => {
    delete process.env.JULES_HOME;
    delete process.env.HOME;
    process.env.TMPDIR = '/tmp/custom-temp';

    vi.mocked(os.homedir).mockReturnValue('/');
    // Mock cwd to return '/' to simulate sandboxed environment where cwd is root
    vi.spyOn(process, 'cwd').mockReturnValue('/');

    // accessSync should fail for root, but pass for tmp
    vi.mocked(fs.accessSync).mockImplementation((path) => {
      if (path === '/') throw new Error('Root not writable');
    });

    expect(getRootDir()).toBe('/tmp/custom-temp');
  });
});

describe('isWritable', () => {
  test('returns true for writable directory', () => {
    vi.mocked(fs.accessSync).mockImplementation(() => {});
    expect(isWritable('/tmp')).toBe(true);
  });

  test('returns false for non-existent or unwritable directory', () => {
    vi.mocked(fs.accessSync).mockImplementation(() => {
      throw new Error('EACCES');
    });
    expect(isWritable('/root')).toBe(false);
  });
});
