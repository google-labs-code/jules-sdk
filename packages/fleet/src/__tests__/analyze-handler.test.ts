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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyzeHandler } from '../analyze/handler.js';
import type { SessionDispatcher } from '../shared/session-dispatcher.js';

function createMockOctokit() {
  return {
    rest: {
      issues: {
        getMilestone: vi.fn().mockResolvedValue({
          data: { number: 1, title: 'Sprint 1' },
        }),
        listForRepo: vi.fn().mockResolvedValue({ data: [] }),
      },
      pulls: {
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
    },
  } as any;
}

function createMockDispatcher(): SessionDispatcher {
  return {
    dispatch: vi.fn().mockResolvedValue({ id: 'session-abc' }),
  };
}

describe('AnalyzeHandler', () => {
  let octokit: ReturnType<typeof createMockOctokit>;
  let dispatcher: ReturnType<typeof createMockDispatcher>;
  const noop = () => {};

  beforeEach(() => {
    octokit = createMockOctokit();
    dispatcher = createMockDispatcher();
  });

  it('auto-injects triage goal when no goal files exist', async () => {
    const handler = new AnalyzeHandler({ octokit, dispatcher });
    const result = await handler.execute({
      goalsDir: '/nonexistent/dir',
      owner: 'o',
      repo: 'r',
      baseBranch: 'main',
    });

    // With the built-in triage goal, an empty dir still produces a session
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionsStarted).toHaveLength(1);
    }
  });

  it('returns NO_GOALS_FOUND when goal file does not exist', async () => {
    const handler = new AnalyzeHandler({ octokit, dispatcher });
    const result = await handler.execute({
      goal: '/nonexistent/goal.md',
      goalsDir: '.fleet/goals',
      owner: 'o',
      repo: 'r',
      baseBranch: 'main',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NO_GOALS_FOUND');
    }
  });

  it('dispatches session for a valid goal file', async () => {
    // Create a temp goal file
    const { mkdtempSync, writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    const dir = mkdtempSync(join(tmpdir(), 'fleet-test-'));
    const goalPath = join(dir, 'test-goal.md');
    writeFileSync(goalPath, `---\nmilestone: "1"\n---\n\n# Test Goal\n\nDo something.`);

    const handler = new AnalyzeHandler({ octokit, dispatcher });
    const result = await handler.execute({
      goal: goalPath,
      goalsDir: '.fleet/goals',
      owner: 'o',
      repo: 'r',
      baseBranch: 'main',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionsStarted).toHaveLength(1);
      expect(result.data.sessionsStarted[0].sessionId).toBe('session-abc');
    }
    expect(dispatcher.dispatch).toHaveBeenCalledOnce();

    // Cleanup
    const { rmSync } = await import('fs');
    rmSync(dir, { recursive: true, force: true });
  });

  it('handles dispatcher failure gracefully', async () => {
    const failingDispatcher: SessionDispatcher = {
      dispatch: vi.fn().mockRejectedValue(new Error('Jules API down')),
    };

    const { mkdtempSync, writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    const dir = mkdtempSync(join(tmpdir(), 'fleet-test-'));
    const goalPath = join(dir, 'test-goal.md');
    writeFileSync(goalPath, '# Test\n\nBody.');

    const handler = new AnalyzeHandler({ octokit, dispatcher: failingDispatcher });
    const result = await handler.execute({
      goal: goalPath,
      goalsDir: '.fleet/goals',
      owner: 'o',
      repo: 'r',
      baseBranch: 'main',
    });

    // Should still succeed (session failure is per-goal, not fatal)
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionsStarted).toHaveLength(0);
    }

    const { rmSync } = await import('fs');
    rmSync(dir, { recursive: true, force: true });
  });
});
