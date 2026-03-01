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

import { describe, it, expect, vi } from 'vitest';
import { FeatureReconcileHandler } from '../init/features/handler.js';
import { FEATURE_REGISTRY } from '../init/features/registry.js';
import type { Octokit } from 'octokit';

/** Builds a mock Octokit with configurable getContent behavior */
function createMockOctokit(behavior: {
  /** File paths returned by getContent for .github/workflows/ */
  installedFiles?: string[];
  /** If set, getContent throws with this status code */
  errorStatus?: number;
} = {}): Octokit {
  const { installedFiles = [], errorStatus } = behavior;

  return {
    rest: {
      repos: {
        getContent: errorStatus
          ? vi.fn().mockRejectedValue(Object.assign(new Error('API error'), { status: errorStatus }))
          : vi.fn().mockResolvedValue({
            data: installedFiles.map((path) => ({ path, type: 'file', name: path.split('/').pop() })),
          }),
      },
    },
  } as unknown as Octokit;
}

const baseInput = {
  owner: 'google',
  repo: 'my-repo',
};

describe('FeatureReconcileHandler', () => {
  // ── Happy path ──────────────────────────────────────────────────────

  it('returns all templates as toAdd when repo has no workflows (404)', async () => {
    const octokit = createMockOctokit({ errorStatus: 404 });
    const handler = new FeatureReconcileHandler(octokit);

    const result = await handler.execute({
      ...baseInput,
      desired: {
        'analyze': true,
        'dispatch': true,
        'merge': true,
        'conflict-detection': true,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toAdd).toHaveLength(4);
      expect(result.data.toRemove).toHaveLength(0);
      expect(result.data.unchanged).toHaveLength(0);
    }
  });

  it('returns empty toAdd/toRemove when desired matches installed', async () => {
    const allPaths = Object.values(FEATURE_REGISTRY).map((t) => t.repoPath);
    const octokit = createMockOctokit({ installedFiles: allPaths });
    const handler = new FeatureReconcileHandler(octokit);

    const result = await handler.execute({
      ...baseInput,
      desired: {
        'analyze': true,
        'dispatch': true,
        'merge': true,
        'conflict-detection': true,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toAdd).toHaveLength(0);
      expect(result.data.toRemove).toHaveLength(0);
      expect(result.data.unchanged).toHaveLength(4);
    }
  });

  // ── Adding features ─────────────────────────────────────────────────

  it('adds conflict-detection when not installed but desired', async () => {
    const installedPaths = [
      FEATURE_REGISTRY['analyze'].repoPath,
      FEATURE_REGISTRY['dispatch'].repoPath,
      FEATURE_REGISTRY['merge'].repoPath,
    ];
    const octokit = createMockOctokit({ installedFiles: installedPaths });
    const handler = new FeatureReconcileHandler(octokit);

    const result = await handler.execute({
      ...baseInput,
      desired: {
        'analyze': true,
        'dispatch': true,
        'merge': true,
        'conflict-detection': true,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toAdd).toHaveLength(1);
      expect(result.data.toAdd[0].repoPath).toBe(
        FEATURE_REGISTRY['conflict-detection'].repoPath,
      );
      expect(result.data.unchanged).toHaveLength(3);
    }
  });

  it('adds only missing templates when some already exist', async () => {
    const installedPaths = [FEATURE_REGISTRY['analyze'].repoPath];
    const octokit = createMockOctokit({ installedFiles: installedPaths });
    const handler = new FeatureReconcileHandler(octokit);

    const result = await handler.execute({
      ...baseInput,
      desired: {
        'analyze': true,
        'dispatch': true,
        'merge': true,
        'conflict-detection': true,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toAdd).toHaveLength(3);
      expect(result.data.unchanged).toHaveLength(1);
    }
  });

  // ── Removing features ───────────────────────────────────────────────

  it('marks merge workflow for removal when desired is false', async () => {
    const allPaths = Object.values(FEATURE_REGISTRY).map((t) => t.repoPath);
    const octokit = createMockOctokit({ installedFiles: allPaths });
    const handler = new FeatureReconcileHandler(octokit);

    const result = await handler.execute({
      ...baseInput,
      desired: {
        'analyze': true,
        'dispatch': true,
        'merge': false,
        'conflict-detection': true,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toRemove).toHaveLength(1);
      expect(result.data.toRemove[0]).toBe(FEATURE_REGISTRY['merge'].repoPath);
      expect(result.data.unchanged).toHaveLength(3);
    }
  });

  it('marks multiple workflows for removal', async () => {
    const allPaths = Object.values(FEATURE_REGISTRY).map((t) => t.repoPath);
    const octokit = createMockOctokit({ installedFiles: allPaths });
    const handler = new FeatureReconcileHandler(octokit);

    const result = await handler.execute({
      ...baseInput,
      desired: {
        'analyze': false,
        'dispatch': false,
        'merge': true,
        'conflict-detection': true,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toRemove).toHaveLength(2);
      expect(result.data.unchanged).toHaveLength(2);
    }
  });

  // ── Mixed add + remove ─────────────────────────────────────────────

  it('adds conflict-detection and removes dispatch in one reconcile', async () => {
    const installedPaths = [
      FEATURE_REGISTRY['analyze'].repoPath,
      FEATURE_REGISTRY['dispatch'].repoPath,
      FEATURE_REGISTRY['merge'].repoPath,
    ];
    const octokit = createMockOctokit({ installedFiles: installedPaths });
    const handler = new FeatureReconcileHandler(octokit);

    const result = await handler.execute({
      ...baseInput,
      desired: {
        'analyze': true,
        'dispatch': false,
        'merge': true,
        'conflict-detection': true,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toAdd).toHaveLength(1);
      expect(result.data.toAdd[0].repoPath).toBe(
        FEATURE_REGISTRY['conflict-detection'].repoPath,
      );
      expect(result.data.toRemove).toHaveLength(1);
      expect(result.data.toRemove[0]).toBe(FEATURE_REGISTRY['dispatch'].repoPath);
      expect(result.data.unchanged).toHaveLength(2);
    }
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  it('handles all features set to false', async () => {
    const allPaths = Object.values(FEATURE_REGISTRY).map((t) => t.repoPath);
    const octokit = createMockOctokit({ installedFiles: allPaths });
    const handler = new FeatureReconcileHandler(octokit);

    const result = await handler.execute({
      ...baseInput,
      desired: {
        'analyze': false,
        'dispatch': false,
        'merge': false,
        'conflict-detection': false,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toAdd).toHaveLength(0);
      expect(result.data.toRemove).toHaveLength(4);
    }
  });

  it('treats missing desired keys as true (default enabled)', async () => {
    const octokit = createMockOctokit({ errorStatus: 404 });
    const handler = new FeatureReconcileHandler(octokit);

    const result = await handler.execute({
      ...baseInput,
      desired: { 'merge': false },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // merge is false → not added. Other 3 are undefined → default true → added
      expect(result.data.toAdd).toHaveLength(3);
      const addedPaths = result.data.toAdd.map((t) => t.repoPath);
      expect(addedPaths).not.toContain(FEATURE_REGISTRY['merge'].repoPath);
    }
  });

  // ── Error cases ─────────────────────────────────────────────────────

  it('returns GITHUB_API_ERROR on 403 rate limit', async () => {
    const octokit = createMockOctokit({ errorStatus: 403 });
    const handler = new FeatureReconcileHandler(octokit);

    const result = await handler.execute({
      ...baseInput,
      desired: { 'analyze': true },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('GITHUB_API_ERROR');
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('returns DETECTION_FAILED on non-404 API errors', async () => {
    const octokit = createMockOctokit({ errorStatus: 500 });
    const handler = new FeatureReconcileHandler(octokit);

    const result = await handler.execute({
      ...baseInput,
      desired: { 'analyze': true },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('DETECTION_FAILED');
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('never throws — all errors are Result values', async () => {
    const octokit = {
      rest: {
        repos: {
          getContent: vi.fn().mockImplementation(() => {
            throw new TypeError('Network failure');
          }),
        },
      },
    } as unknown as Octokit;
    const handler = new FeatureReconcileHandler(octokit);

    // Should not throw
    const result = await handler.execute({
      ...baseInput,
      desired: { 'analyze': true },
    });

    expect(result.success).toBe(false);
  });
});
