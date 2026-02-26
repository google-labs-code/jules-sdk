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
import { TRIAGE_GOAL_FILENAME, getBuiltInTriagePrompt } from '../analyze/triage-prompt.js';
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
    dispatch: vi.fn().mockResolvedValue({ id: 'session-triage-1' }),
  };
}

describe('Triage Goal Auto-Injection', () => {
  it('exports the correct reserved filename', () => {
    expect(TRIAGE_GOAL_FILENAME).toBe('triage.md');
  });

  it('generates prompt with repo name', () => {
    const prompt = getBuiltInTriagePrompt('acme/widgets');
    expect(prompt).toContain('acme/widgets');
    expect(prompt).toContain('not assigned to a milestone');
    expect(prompt).toContain('fleet');
    expect(prompt).toContain('## Insight Hints');
  });

  it('auto-injects triage goal when no triage.md exists in empty dir', async () => {
    const { mkdtempSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    const dir = mkdtempSync(join(tmpdir(), 'fleet-triage-'));

    const octokit = createMockOctokit();
    const dispatcher = createMockDispatcher();
    const handler = new AnalyzeHandler({ octokit, dispatcher });

    const result = await handler.execute({
      goalsDir: dir,
      owner: 'o',
      repo: 'r',
      baseBranch: 'main',
    });

    // Should succeed with the built-in triage goal
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionsStarted).toHaveLength(1);
      expect(result.data.sessionsStarted[0].sessionId).toBe('session-triage-1');
    }
    expect(dispatcher.dispatch).toHaveBeenCalledOnce();

    const { rmSync } = await import('fs');
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses user triage.md when it exists', async () => {
    const { mkdtempSync, writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    const dir = mkdtempSync(join(tmpdir(), 'fleet-triage-'));
    const triagePath = join(dir, 'triage.md');
    writeFileSync(triagePath, '# Custom Triage\n\nMy custom instructions.');

    const octokit = createMockOctokit();
    const dispatcher = createMockDispatcher();
    const events: Array<{ type: string }> = [];
    const handler = new AnalyzeHandler({ octokit, dispatcher, emit: (e) => events.push(e) });

    const result = await handler.execute({
      goalsDir: dir,
      owner: 'o',
      repo: 'r',
      baseBranch: 'main',
    });

    expect(result.success).toBe(true);
    // Should NOT be using built-in triage goal when user has their own
    const goalStartEvents = events.filter((e) => e.type === 'analyze:goal:start');
    expect(goalStartEvents.length).toBe(1);

    const { rmSync } = await import('fs');
    rmSync(dir, { recursive: true, force: true });
  });
});
