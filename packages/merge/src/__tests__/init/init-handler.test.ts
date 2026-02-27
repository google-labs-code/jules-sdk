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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InitHandler } from '../../init/init-handler.js';

describe('InitHandler', () => {
  let handler: InitHandler;
  let tempDir: string;

  beforeEach(async () => {
    handler = new InitHandler();
    tempDir = await mkdtemp(join(tmpdir(), 'init-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates workflow file in .github/workflows/', async () => {
    const result = await handler.execute({
      outputDir: tempDir,
      workflowName: 'jules-merge-check',
      baseBranch: 'main',
      force: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filePath).toContain('.github/workflows/jules-merge-check.yml');
      expect(result.data.content).toContain('name: jules-merge-check');

      // Verify file was actually written
      const written = await readFile(result.data.filePath, 'utf-8');
      expect(written).toBe(result.data.content);
    }
  });

  it('returns DIRECTORY_NOT_FOUND for nonexistent path', async () => {
    const result = await handler.execute({
      outputDir: '/nonexistent/path/xyz',
      workflowName: 'check',
      baseBranch: 'main',
      force: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('DIRECTORY_NOT_FOUND');
    }
  });

  it('returns FILE_ALREADY_EXISTS without force', async () => {
    // First create
    await handler.execute({
      outputDir: tempDir,
      workflowName: 'check',
      baseBranch: 'main',
      force: false,
    });

    // Second create should fail
    const result = await handler.execute({
      outputDir: tempDir,
      workflowName: 'check',
      baseBranch: 'main',
      force: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FILE_ALREADY_EXISTS');
    }
  });

  it('overwrites existing file with force: true', async () => {
    // First create
    await handler.execute({
      outputDir: tempDir,
      workflowName: 'check',
      baseBranch: 'main',
      force: false,
    });

    // Second create with force
    const result = await handler.execute({
      outputDir: tempDir,
      workflowName: 'check',
      baseBranch: 'develop',
      force: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toContain('branches: [develop]');
    }
  });

  it('returns DIRECTORY_NOT_FOUND when path is a file', async () => {
    const filePath = join(tempDir, 'not-a-dir');
    await writeFile(filePath, 'content');

    const result = await handler.execute({
      outputDir: filePath,
      workflowName: 'check',
      baseBranch: 'main',
      force: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('DIRECTORY_NOT_FOUND');
    }
  });
});
