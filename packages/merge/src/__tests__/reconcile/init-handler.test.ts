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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initHandler } from '../../reconcile/init-handler.js';
import fs from 'fs';
import path from 'path';

const TEST_DIR = '/tmp/jules-merge-init-test';

describe('initHandler', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('generates valid YAML with default base branch', () => {
    const result = initHandler({ dryRun: true });
    expect(result.status).toBe('dry-run');
    expect(result.yaml).toContain('name: Conflict Detection');
    expect(result.yaml).toContain('branches: [main]');
    expect(result.yaml).toContain('jules-merge scan');
  });

  it('accepts a custom base branch via --json payload', () => {
    const result = initHandler({ base: 'develop', dryRun: true });
    expect(result.yaml).toContain('branches: [develop]');
  });

  it('outputs machine-readable JSON with path and base', () => {
    const result = initHandler({ dryRun: true, base: 'main' });
    expect(result.path).toBe('.github/workflows/jules-merge-scan.yml');
    expect(result.base).toBe('main');
  });

  it('writes file when dryRun is false', () => {
    const result = initHandler({ dryRun: false, outDir: TEST_DIR });
    expect(result.status).toBe('created');
    expect(result.path).toBe('.github/workflows/jules-merge-scan.yml');
    const fullPath = path.join(TEST_DIR, '.github/workflows/jules-merge-scan.yml');
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  it('rejects write when file exists and force is false', () => {
    initHandler({ dryRun: false, outDir: TEST_DIR });
    expect(() => initHandler({ dryRun: false, outDir: TEST_DIR })).toThrow(
      'already exists',
    );
  });

  it('allows overwrite when force is true', () => {
    initHandler({ dryRun: false, outDir: TEST_DIR });
    const result = initHandler({
      dryRun: false,
      outDir: TEST_DIR,
      force: true,
    });
    expect(result.status).toBe('created');
  });
});
