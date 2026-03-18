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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { state, resetCommitCounter } from '../fixtures/github.js';

// Mock the shared github module with our DI-compatible fixtures
vi.mock('../../shared/github.js', async () => {
  return await import('../fixtures/github.js');
});

// Mock the manifest to use a temp directory
const MANIFEST_DIR = path.join(process.cwd(), '.jules-test-merge-discovery');
const MANIFEST_PATH = path.join(MANIFEST_DIR, 'manifest.json');

vi.stubEnv('JULES_MERGE_MANIFEST_PATH', MANIFEST_PATH);

function cleanManifest() {
  if (fs.existsSync(MANIFEST_DIR)) {
    fs.rmSync(MANIFEST_DIR, { recursive: true });
  }
}

// Helper to generate N PRs with fixture-compatible compare data
function setupOpenPrs(
  count: number,
  options?: {
    overlappingFile?: string;
    labels?: string[];
    unlabeledCount?: number;
  },
) {
  const prs: any[] = [];
  for (let i = 0; i < count; i++) {
    const prNum = 200 + i;
    const sha = `discover-pr${prNum}-sha`;
    const branch = `discover-branch-${prNum}`;

    // Add to state.prs so getPullRequest works
    state.prs[prNum] = { head: { sha, ref: branch } };

    // Add compare data
    const filename =
      options?.overlappingFile && i < 2
        ? options.overlappingFile
        : `src/discovered-${prNum}.ts`;
    state.compares[`main-sha-v1...${sha}`] = {
      files: [{ filename, status: 'modified' }],
    };

    // Add labels if specified
    const hasLabels =
      options?.unlabeledCount !== undefined
        ? i >= options.unlabeledCount
        : true;
    prs.push({
      number: prNum,
      head: { sha, ref: branch },
      labels: hasLabels && options?.labels ? [...options.labels] : [],
    });
  }

  state.openPrs = { main: prs };
}

describe('scan --all discovery', () => {
  beforeEach(() => {
    cleanManifest();
    resetCommitCounter();
    state.refs = {};
    state.pullRequests = undefined;
    state.openPrs = undefined;
    state.repo = { allow_squash_merge: true, allow_merge_commit: true };
  });

  afterEach(() => {
    cleanManifest();
  });

  // ─── Group B: Safety Guardrails ───────────────────────────────

  it('B1: --all rejects when discovered PRs exceed default cap', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    setupOpenPrs(26);

    await expect(
      scanHandler({} as any, {
        all: true,
        repo: 'owner/repo',
        base: 'main',
      }),
    ).rejects.toThrow(/26.*max.*25|--max-prs/i);
  });

  it('B2: --all with maxPrs overrides the default cap', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    setupOpenPrs(30);

    const result = await scanHandler({} as any, {
      all: true,
      repo: 'owner/repo',
      base: 'main',
      maxPrs: 50,
    });
    expect(result.prs).toHaveLength(30);
  });

  it('B3: --all rejects when discovered PRs exceed custom maxPrs', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    setupOpenPrs(60);

    await expect(
      scanHandler({} as any, {
        all: true,
        repo: 'owner/repo',
        base: 'main',
        maxPrs: 50,
      }),
    ).rejects.toThrow(/60.*max.*50|--max-prs/i);
  });

  it('B4: --all with labels filters PRs before cap check', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    // 30 total PRs, but 25 unlabeled + 5 labeled as 'jules-bot'
    setupOpenPrs(30, {
      labels: ['jules-bot'],
      unlabeledCount: 25,
    });

    const result = await scanHandler({} as any, {
      all: true,
      repo: 'owner/repo',
      base: 'main',
      labels: ['jules-bot'],
    });
    // Should succeed (5 < default cap of 25) and only scan labeled PRs
    expect(result.prs).toHaveLength(5);
  });

  // ─── Group C: Discovery Happy Paths ───────────────────────────

  it('C1: --all discovers open PRs and produces clean result', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    setupOpenPrs(3);

    const result = await scanHandler({} as any, {
      all: true,
      repo: 'owner/repo',
      base: 'main',
    });
    expect(result.status).toBe('clean');
    expect(result.cleanFiles).toHaveLength(3);
    expect(result.hotZones).toHaveLength(0);
  });

  it('C2: --all detects conflicts among discovered PRs', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    setupOpenPrs(2, { overlappingFile: 'src/shared.ts' });

    const result = await scanHandler({} as any, {
      all: true,
      repo: 'owner/repo',
      base: 'main',
    });
    expect(result.status).toBe('conflicts');
    expect(result.hotZones).toHaveLength(1);
    expect(result.hotZones[0].filePath).toBe('src/shared.ts');
    expect(result.hotZones[0].competingPrs).toHaveLength(2);
  });

  it('C3: --all with zero open PRs produces clean result', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    state.openPrs = { main: [] };

    const result = await scanHandler({} as any, {
      all: true,
      repo: 'owner/repo',
      base: 'main',
    });
    expect(result.status).toBe('clean');
    expect(result.prs).toHaveLength(0);
    expect(result.cleanFiles).toHaveLength(0);
  });

  // ─── Group D: Output Contract ─────────────────────────────────

  it('D1: --all output includes discoveredPrs and scannedPrs', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');
    setupOpenPrs(3);

    const result = await scanHandler({} as any, {
      all: true,
      repo: 'owner/repo',
      base: 'main',
    });
    expect(result.discoveredPrs).toBe(3);
    expect(result.scannedPrs).toBe(3);
  });

  it('D2: explicit prs output omits discoveredPrs', async () => {
    const { scanHandler } = await import('../../reconcile/scan-handler.js');

    const result = await scanHandler({} as any, {
      prs: [1, 2],
      repo: 'owner/repo',
      base: 'main',
    });
    expect(result.discoveredPrs).toBeUndefined();
    expect(result.scannedPrs).toBeUndefined();
  });
});
