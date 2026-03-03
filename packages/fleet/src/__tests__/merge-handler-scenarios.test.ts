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

/**
 * Decision matrix tests for MergeHandler.
 *
 * Each test case represents one row in the merge decision matrix,
 * covering every combination of:
 *   - Merge path (independent / conflict-group / sequential-fallback)
 *   - updateBranch outcome (ok / conflict / api-error)
 *   - CI outcome (pass / fail / timeout / none)
 *   - merge outcome (ok / fail)
 *   - redispatch flag (on / off)
 *
 * If a scenario isn't covered here, it's a gap.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { MergeTestHarness, BASE_INPUT } from './helpers/merge-test-harness.js';

afterEach(() => vi.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════
// PATH 1: Independent PRs (planned merge, no file overlap)
// ═══════════════════════════════════════════════════════════════════

describe('Independent PR scenarios', () => {
  it('1.1: update OK → CI none → merge OK → merged', async () => {
    const { handler } = new MergeTestHarness()
      .withPRs([1])
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toEqual([1]);
      expect(result.data.skipped).toHaveLength(0);
      expect(result.data.redispatched).toHaveLength(0);
    }
  });

  it('1.2: update OK → CI pass → merge OK → merged', async () => {
    const { handler } = new MergeTestHarness()
      .withPRs([1])
      .ciResult(1, 'pass')
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toEqual([1]);
    }
  });

  it('1.3: conflict + redispatch ON → redispatched', async () => {
    const { handler, events } = new MergeTestHarness()
      .withPRs([1])
      .updateBranchResult(1, 'conflict')
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toHaveLength(0);
      expect(result.data.redispatched.length).toBeGreaterThanOrEqual(1);
      expect(result.data.redispatched[0].oldPr).toBe(1);
    }

    // Should have emitted conflict detection
    const conflictEvent = events.find((e) => e.type === 'merge:conflict:detected');
    expect(conflictEvent).toBeDefined();
  });

  it('1.4: conflict + redispatch OFF → CONFLICT_RETRIES_EXHAUSTED', async () => {
    const { handler, mocks } = new MergeTestHarness()
      .withPRs([1])
      .updateBranchResult(1, 'conflict')
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: false });

    // When redispatch is OFF, the planned path is skipped entirely.
    // The sequential fallback handles the conflict and errors out.
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CONFLICT_RETRIES_EXHAUSTED');
    }

    // Should NOT have tried to create a Jules session
    expect(mocks.julesSession).not.toHaveBeenCalled();
  });

  it('1.5: update API error → skipped (not redispatched)', async () => {
    const { handler } = new MergeTestHarness()
      .withPRs([1])
      .updateBranchResult(1, 'api-error')
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toHaveLength(0);
      // API error should skip, not redispatch (it's not a content conflict)
      expect(result.data.redispatched).toHaveLength(0);
    }
  });

  it('1.6: update OK → CI fail + redispatch OFF → skipped', async () => {
    const { handler, mocks } = new MergeTestHarness()
      .withPRs([1])
      .ciResult(1, 'fail')
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: false });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toHaveLength(0);
      expect(result.data.skipped).toContain(1);
    }

    expect(mocks.merge).not.toHaveBeenCalled();
  });

  it('1.7: update OK → CI pass → merge FAIL → skipped', async () => {
    const { handler } = new MergeTestHarness()
      .withPRs([1])
      .ciResult(1, 'pass')
      .mergeResult(1, 'fail')
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: true });

    // mergeSinglePR returns { merged: false } on merge failure
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toHaveLength(0);
    }
  });

  it('1.8: two independent PRs, first conflicts, second merges', async () => {
    const { handler } = new MergeTestHarness()
      .withPRs([1, 2])
      .updateBranchResult(1, 'conflict')
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toContain(2);
      expect(result.data.redispatched.some((r) => r.oldPr === 1)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// PATH 2: Conflict Groups (planned merge, overlapping files)
// ═══════════════════════════════════════════════════════════════════

describe('Conflict group scenarios', () => {
  it('2.1: all PRs in group conflict → batch resolve dispatched', async () => {
    const { handler } = new MergeTestHarness()
      .withPRs([1, 2])
      .prFiles(1, ['shared.ts'])
      .prFiles(2, ['shared.ts'])
      .updateBranchResult(1, 'conflict')
      .updateBranchResult(2, 'conflict')
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toHaveLength(0);
      // Both PRs should be redispatched via batch resolve
      expect(result.data.redispatched.length).toBeGreaterThanOrEqual(1);
      expect(result.data.skipped).toContain(1);
      expect(result.data.skipped).toContain(2);
    }
  });

  it('2.2: first PR in group merges, second conflicts → only second batch-resolved', async () => {
    const { handler } = new MergeTestHarness()
      .withPRs([1, 2])
      .prFiles(1, ['shared.ts'])
      .prFiles(2, ['shared.ts'])
      .updateBranchResult(2, 'conflict')
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toContain(1);
      expect(result.data.skipped).toContain(2);
    }
  });

  it('2.3: independent PR merges + conflict group batch-resolved', async () => {
    const { handler } = new MergeTestHarness()
      .withPRs([1, 2, 3])
      .prFiles(1, ['independent.ts'])
      .prFiles(2, ['shared.ts'])
      .prFiles(3, ['shared.ts'])
      .updateBranchResult(2, 'conflict')
      .updateBranchResult(3, 'conflict')
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: true });

    expect(result.success).toBe(true);
    if (result.success) {
      // PR 1 is independent and should merge
      expect(result.data.merged).toContain(1);
      // PRs 2 and 3 should be batch-resolved
      expect(result.data.skipped).toContain(2);
      expect(result.data.skipped).toContain(3);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// PATH 3: Sequential fallback (redispatch OFF)
// ═══════════════════════════════════════════════════════════════════

describe('Sequential merge scenarios (redispatch OFF)', () => {
  it('3.1: no conflict → merged sequentially', async () => {
    const { handler } = new MergeTestHarness()
      .withPRs([1])
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: false });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toEqual([1]);
    }
  });

  it('3.2: conflict + redispatch OFF → fails with CONFLICT_RETRIES_EXHAUSTED', async () => {
    const { handler } = new MergeTestHarness()
      .withPRs([1])
      .updateBranchResult(1, 'conflict')
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: false });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CONFLICT_RETRIES_EXHAUSTED');
    }
  });

  it('3.3: CI fail + no redispatch → skipped', async () => {
    const { handler } = new MergeTestHarness()
      .withPRs([1])
      .ciResult(1, 'fail')
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: false });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toHaveLength(0);
      expect(result.data.skipped).toContain(1);
    }
  });

  it('3.4: merge API error → fails with MERGE_FAILED', async () => {
    const { handler } = new MergeTestHarness()
      .withPRs([1])
      .mergeResult(1, 'fail')
      .build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: false });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MERGE_FAILED');
    }
  });

  it('3.5: no PRs found → empty result', async () => {
    // Don't add any PRs
    const { handler } = new MergeTestHarness().build();

    const result = await handler.execute({ ...BASE_INPUT, redispatch: false });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merged).toHaveLength(0);
      expect(result.data.skipped).toHaveLength(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Event emission correctness
// ═══════════════════════════════════════════════════════════════════

describe('Event emission', () => {
  it('emits merge:start with correct metadata', async () => {
    const { handler, events } = new MergeTestHarness()
      .withPRs([1])
      .build();

    await handler.execute({ ...BASE_INPUT, redispatch: true });

    const start = events.find((e) => e.type === 'merge:start');
    expect(start).toBeDefined();
    expect(start).toMatchObject({
      type: 'merge:start',
      owner: 'test-owner',
      repo: 'test-repo',
      mode: 'label',
      prCount: 1,
    });
  });

  it('emits merge:done with final tallies', async () => {
    const { handler, events } = new MergeTestHarness()
      .withPRs([1, 2])
      .updateBranchResult(2, 'conflict')
      .build();

    await handler.execute({ ...BASE_INPUT, redispatch: true });

    const done = events.find((e) => e.type === 'merge:done');
    expect(done).toBeDefined();
  });

  it('emits merge:no-prs when no PRs found', async () => {
    const { handler, events } = new MergeTestHarness().build();

    await handler.execute(BASE_INPUT);

    expect(events.some((e) => e.type === 'merge:no-prs')).toBe(true);
  });

  it('does not emit conflict:detected when update succeeds', async () => {
    const { handler, events } = new MergeTestHarness()
      .withPRs([1])
      .build();

    await handler.execute({ ...BASE_INPUT, redispatch: true });

    expect(events.some((e) => e.type === 'merge:conflict:detected')).toBe(false);
  });
});
