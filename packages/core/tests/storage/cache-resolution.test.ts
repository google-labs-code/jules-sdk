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

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getRootDir } from '../../src/storage/root.js';
import * as fs from 'node:fs';
import * as os from 'node:os';

// Use vi.mock to automatically mock the modules
vi.mock('node:fs');
vi.mock('node:os');

describe('Cache Directory Resolution', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default mocks for a happy path, using vi.mocked for type safety
    vi.mocked(fs.accessSync).mockReturnValue(undefined); // Successful accessSync returns undefined
    vi.mocked(os.homedir).mockReturnValue('/Users/test');
    process.env.HOME = '/Users/test';
    process.env.JULES_HOME = '';
    process.env.TMPDIR = '/tmp';
  });

  it('CACHE-01: should return cwd when package.json exists', () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/my-project');
    vi.mocked(fs.existsSync).mockImplementation(
      (p: fs.PathLike) => p === '/tmp/my-project/package.json',
    );

    const rootDir = getRootDir();
    expect(rootDir).toBe('/tmp/my-project');
  });

  it('CACHE-02: should return home when no package.json in cwd', () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/random-dir');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const rootDir = getRootDir();
    expect(rootDir).toBe('/Users/test');
  });

  it('CACHE-03: JULES_HOME should override everything', () => {
    process.env.JULES_HOME = '/data/jules-override';
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/my-project');
    vi.mocked(fs.existsSync).mockImplementation(
      (p: fs.PathLike) => p === '/tmp/my-project/package.json',
    );

    const rootDir = getRootDir();
    expect(rootDir).toBe('/data/jules-override');
  });

  it('CACHE-04: should fall back to TMPDIR when home is not writable', () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/random-dir');
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.accessSync).mockImplementation((p: fs.PathLike) => {
      if (p === '/Users/test') {
        throw new Error('Permission denied');
      }
    });

    const rootDir = getRootDir();
    expect(rootDir).toBe('/tmp');
  });
});
