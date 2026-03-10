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
import fs from 'fs';
import path from 'path';
import { state, resetCommitCounter } from '../fixtures/github.js';

// Mock the shared github module with our DI-compatible fixtures
vi.mock('../../shared/github.js', async () => {
  return await import('../fixtures/github.js');
});

// Mock the manifest to use a temp directory
const MANIFEST_DIR = path.join(process.cwd(), '.jules-test-merge');
const MANIFEST_PATH = path.join(MANIFEST_DIR, 'manifest.json');

vi.stubEnv('JULES_MERGE_MANIFEST_PATH', MANIFEST_PATH);

function cleanManifest() {
  if (fs.existsSync(MANIFEST_DIR)) {
    fs.rmSync(MANIFEST_DIR, { recursive: true });
  }
}

describe('critical-paths', () => {
  beforeEach(() => {
    cleanManifest();
    resetCommitCounter();
    state.refs = {};
    state.pullRequests = undefined;
    state.repo = { allow_squash_merge: true, allow_merge_commit: true };
  });

  afterEach(() => {
    cleanManifest();
  });

  // ─── 1. Clean batch — no overlapping files ───────────────────

  it('scan: detects no conflicts for non-overlapping PRs', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    const result = await scanHandler({} as any, {
      prs: [1, 2, 3],
      repo: 'owner/repo',
      base: 'main',
    });
    expect(result.status).toBe('clean');
    expect(result.hotZones).toHaveLength(0);
    expect(result.cleanFiles).toHaveLength(3);
  });

  // ─── 2. Textual conflicts + resolution ────────────────────────

  it('scan→stage→status→push: full resolution pipeline', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    const { stageResolutionHandler } = await import(
      '../../reconcile/stage-resolution-handler.js'
    );
    const { statusHandler } = await import('../../reconcile/status-handler.js');
    const { pushHandler } = await import('../../reconcile/push-handler.js');

    // Scan PRs that both modify src/config.ts
    const scan = await scanHandler({} as any, {
      prs: [10, 11],
      repo: 'owner/repo',
      base: 'main',
    });
    expect(scan.status).toBe('conflicts');
    expect(scan.hotZones).toHaveLength(1);
    expect(scan.hotZones[0].filePath).toBe('src/config.ts');

    // Status should show 1 pending
    const status1 = await statusHandler({});
    expect(status1.ready).toBe(false);
    expect(status1.pending).toHaveLength(1);

    // Stage resolution
    await stageResolutionHandler({
      filePath: 'src/config.ts',
      parents: ['main', '10', '11'],
      content: 'export const DEFAULT_TIMEOUT = 7500;',
    });

    // Status should now be ready
    const status2 = await statusHandler({});
    expect(status2.ready).toBe(true);
    expect(status2.pending).toHaveLength(0);

    // Push
    const pushResult = await pushHandler({} as any, {
      branch: 'reconcile/config',
      message: 'Reconcile config',
      repo: 'owner/repo',
    });
    expect(pushResult.status).toBe('pushed');
    expect(pushResult.pullRequest?.number).toBe(999);
  });

  // ─── 3. Input hardening ───────────────────────────────────────

  it('rejects file paths with path traversal', async () => {
    const { validateFilePath } = await import('../../shared/validators.js');
    expect(() => validateFilePath('../etc/passwd')).toThrow('PATH_TRAVERSAL');
  });

  it('rejects file paths with control characters', async () => {
    const { validateFilePath } = await import('../../shared/validators.js');
    expect(() => validateFilePath('src/foo\x00.ts')).toThrow('CONTROL_CHAR');
  });

  it('rejects branch names starting with refs/', async () => {
    const { validateBranchName } = await import('../../shared/validators.js');
    expect(() => validateBranchName('refs/heads/main')).toThrow(
      'RESERVED_BRANCH',
    );
  });

  it('rejects branch names ending with .lock', async () => {
    const { validateBranchName } = await import('../../shared/validators.js');
    expect(() => validateBranchName('my-branch.lock')).toThrow(
      'INVALID_BRANCH',
    );
  });

  // ─── 4. dry-run behavior ──────────────────────────────────────

  it('stage-resolution --dry-run does not modify manifest', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    const { stageResolutionHandler } = await import(
      '../../reconcile/stage-resolution-handler.js'
    );
    const { statusHandler } = await import('../../reconcile/status-handler.js');

    await scanHandler({} as any, {
      prs: [10, 11],
      repo: 'owner/repo',
    });

    const dryResult = await stageResolutionHandler({
      filePath: 'src/config.ts',
      parents: ['main', '10', '11'],
      content: 'dry run content',
      dryRun: true,
    });
    expect(dryResult.status).toBe('staged');

    // Manifest should still show pending
    const status = await statusHandler({});
    expect(status.pending).toHaveLength(1);
  });

  // ─── 5. Push dry-run ──────────────────────────────────────────

  it('push --dry-run returns validation without creating refs', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    const { stageResolutionHandler } = await import(
      '../../reconcile/stage-resolution-handler.js'
    );
    const { pushHandler } = await import('../../reconcile/push-handler.js');

    await scanHandler({} as any, {
      prs: [10, 11],
      repo: 'owner/repo',
    });
    await stageResolutionHandler({
      filePath: 'src/config.ts',
      parents: ['main', '10', '11'],
      content: 'resolved',
    });

    const result = await pushHandler({} as any, {
      branch: 'reconcile/test',
      message: 'Test',
      repo: 'owner/repo',
      dryRun: true,
    });
    expect(result.status).toBe('dry-run');
    expect(result.commitSha).toBeUndefined();
  });

  // ─── 6. Squash-merge protection ───────────────────────────────

  it('push rejects when repo only allows squash merges', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    const { stageResolutionHandler } = await import(
      '../../reconcile/stage-resolution-handler.js'
    );
    const { pushHandler } = await import('../../reconcile/push-handler.js');

    await scanHandler({} as any, {
      prs: [10, 11],
      repo: 'owner/repo',
    });
    await stageResolutionHandler({
      filePath: 'src/config.ts',
      parents: ['main', '10', '11'],
      content: 'resolved',
    });

    // Simulate squash-only repo
    state.repo = { allow_squash_merge: true, allow_merge_commit: false };

    await expect(
      pushHandler({} as any, {
        branch: 'reconcile/test',
        message: 'Test',
        repo: 'owner/repo',
      }),
    ).rejects.toThrow('squash');
  });

  // ─── 7. Sequential vs. Octopus merge strategies ───────────────

  it('push with sequential strategy creates a merge chain', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    const { stageResolutionHandler } = await import(
      '../../reconcile/stage-resolution-handler.js'
    );
    const { pushHandler } = await import('../../reconcile/push-handler.js');

    await scanHandler({} as any, {
      prs: [10, 11],
      repo: 'owner/repo',
    });
    await stageResolutionHandler({
      filePath: 'src/config.ts',
      parents: ['main', '10', '11'],
      content: 'resolved for sequential',
    });

    const result = await pushHandler({} as any, {
      branch: 'reconcile/sequential',
      message: 'Sequential merge',
      repo: 'owner/repo',
      mergeStrategy: 'sequential',
    });
    expect(result.status).toBe('pushed');
    expect(result.mergeChain).toBeDefined();
    expect(result.mergeChain).toHaveLength(2);
    // Each step should have exactly 2 parents
    result.mergeChain!.forEach((step) => {
      expect(step.parents).toHaveLength(2);
    });
  });

  it('push with octopus strategy creates a single multi-parent commit', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    const { stageResolutionHandler } = await import(
      '../../reconcile/stage-resolution-handler.js'
    );
    const { pushHandler } = await import('../../reconcile/push-handler.js');

    await scanHandler({} as any, {
      prs: [10, 11],
      repo: 'owner/repo',
    });
    await stageResolutionHandler({
      filePath: 'src/config.ts',
      parents: ['main', '10', '11'],
      content: 'resolved for octopus',
    });

    const result = await pushHandler({} as any, {
      branch: 'reconcile/octopus',
      message: 'Octopus merge',
      repo: 'owner/repo',
      mergeStrategy: 'octopus',
    });
    expect(result.status).toBe('pushed');
    expect(result.mergeChain).toBeUndefined(); // Octopus has no chain
    expect(result.parents).toHaveLength(3); // base + 2 PRs
  });

  // ─── 8. Correct parent linking in sequential chain ────────────

  it('sequential merge chain has correct parent linking', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    const { stageResolutionHandler } = await import(
      '../../reconcile/stage-resolution-handler.js'
    );
    const { pushHandler } = await import('../../reconcile/push-handler.js');

    await scanHandler({} as any, {
      prs: [10, 11],
      repo: 'owner/repo',
    });
    await stageResolutionHandler({
      filePath: 'src/config.ts',
      parents: ['main', '10', '11'],
      content: 'resolved',
    });

    const result = await pushHandler({} as any, {
      branch: 'reconcile/chain',
      message: 'Chain test',
      repo: 'owner/repo',
      mergeStrategy: 'sequential',
    });

    const chain = result.mergeChain!;
    // First commit: parents = [baseSha, pr10.headSha]
    expect(chain[0].parents[0]).toBe('main-sha-v1');
    expect(chain[0].parents[1]).toBe('pr10-head-sha');
    // Second commit: parents = [firstCommitSha, pr11.headSha]
    expect(chain[1].parents[0]).toBe(chain[0].commitSha);
    expect(chain[1].parents[1]).toBe('pr11-head-sha');
  });

  // ─── 9. Single PR handling ────────────────────────────────────

  it('single PR scan produces clean result with no hot zones', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    const result = await scanHandler({} as any, {
      prs: [1],
      repo: 'owner/repo',
    });
    expect(result.status).toBe('clean');
    expect(result.hotZones).toHaveLength(0);
    expect(result.cleanFiles).toHaveLength(1);
  });

  // ─── 10. get-contents base source uses merge base ─────────────

  it('get-contents with source=base resolves to merge base SHA', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    const { getContentsHandler } = await import(
      '../../reconcile/get-contents-handler.js'
    );

    await scanHandler({} as any, {
      prs: [10, 11],
      repo: 'owner/repo',
    });

    const result = await getContentsHandler({} as any, {
      filePath: 'src/config.ts',
      source: 'base',
      repo: 'owner/repo',
    });
    // Should have used the merge_base_commit.sha (base-sha) not main-sha-v1
    expect(result.content).toBe('export const DEFAULT_TIMEOUT = 5000;');
  });

  // ─── 11. Deleted files in tree ────────────────────────────────

  it('scan correctly marks deleted files', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    const result = await scanHandler({} as any, {
      prs: [50, 51],
      repo: 'owner/repo',
    });
    expect(result.status).toBe('clean');

    const deprecated = result.cleanFiles.find(
      (f) => f.filePath === 'src/deprecated.ts',
    );
    expect(deprecated).toBeDefined();
  });

  // ─── 12. Error types & exit codes ─────────────────────────────

  it('ConflictError has exit code 1', async () => {
    const { ConflictError, getExitCode } = await import('../../shared/errors.js');
    const err = new ConflictError('test');
    expect(err.exitCode).toBe(1);
    expect(getExitCode(err)).toBe(1);
  });

  it('HardError has exit code 2', async () => {
    const { HardError, getExitCode } = await import('../../shared/errors.js');
    const err = new HardError('test');
    expect(err.exitCode).toBe(2);
    expect(getExitCode(err)).toBe(2);
  });

  it('unknown errors get exit code 2', async () => {
    const { getExitCode } = await import('../../shared/errors.js');
    expect(getExitCode(new Error('generic'))).toBe(2);
  });
});
