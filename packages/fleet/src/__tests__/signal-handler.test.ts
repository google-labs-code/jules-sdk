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
import { SignalCreateHandler } from '../signal/handler.js';
import type { SignalCreateInput } from '../signal/spec.js';

function createMockOctokit(overrides: Record<string, any> = {}) {
  return {
    rest: {
      issues: {
        create: vi.fn().mockResolvedValue({
          data: { number: 42, html_url: 'https://github.com/o/r/issues/42' },
        }),
        listMilestones: vi.fn().mockResolvedValue({
          data: [],
        }),
        ...overrides,
      },
    },
  } as any;
}

const baseInput: SignalCreateInput = {
  owner: 'google',
  repo: 'jules-sdk',
  kind: 'assessment',
  title: '[Fleet Execution] Fix auth module',
  body: '### Objective\nFix the auth module',
  tags: ['fleet'],
};

describe('SignalCreateHandler', () => {
  it('creates an assessment with fleet-assessment label', async () => {
    const octokit = createMockOctokit();
    const handler = new SignalCreateHandler({ octokit });

    const result = await handler.execute(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(42);
      expect(result.data.url).toBe('https://github.com/o/r/issues/42');
    }

    expect(octokit.rest.issues.create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'google',
        repo: 'jules-sdk',
        title: '[Fleet Execution] Fix auth module',
        labels: ['fleet', 'fleet-assessment'],
      }),
    );
  });

  it('creates an insight with fleet-insight label', async () => {
    const octokit = createMockOctokit();
    const handler = new SignalCreateHandler({ octokit });

    const result = await handler.execute({ ...baseInput, kind: 'insight' });

    expect(result.success).toBe(true);
    expect(octokit.rest.issues.create).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: ['fleet', 'fleet-insight'],
      }),
    );
  });

  it('resolves scope to milestone number', async () => {
    const octokit = createMockOctokit({
      listMilestones: vi.fn().mockResolvedValue({
        data: [
          { title: 'Sprint 5', number: 7 },
          { title: 'Sprint 6', number: 8 },
        ],
      }),
    });
    const handler = new SignalCreateHandler({ octokit });

    const result = await handler.execute({
      ...baseInput,
      scope: 'Sprint 5',
    });

    expect(result.success).toBe(true);
    expect(octokit.rest.issues.create).toHaveBeenCalledWith(
      expect.objectContaining({ milestone: 7 }),
    );
  });

  it('returns SCOPE_NOT_FOUND when milestone does not exist', async () => {
    const octokit = createMockOctokit({
      listMilestones: vi.fn().mockResolvedValue({ data: [] }),
    });
    const handler = new SignalCreateHandler({ octokit });

    const result = await handler.execute({
      ...baseInput,
      scope: 'Nonexistent',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SCOPE_NOT_FOUND');
      expect(result.error.recoverable).toBe(true);
      expect(result.error.suggestion).toContain('Nonexistent');
    }
  });

  it('returns GITHUB_API_ERROR on API failure', async () => {
    const apiError = new Error('Not Found');
    (apiError as any).status = 404;
    const octokit = createMockOctokit({
      create: vi.fn().mockRejectedValue(apiError),
    });
    const handler = new SignalCreateHandler({ octokit });

    const result = await handler.execute(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('GITHUB_API_ERROR');
    }
  });

  it('returns UNKNOWN_ERROR on unexpected failure', async () => {
    const octokit = createMockOctokit({
      create: vi.fn().mockRejectedValue('unexpected string error'),
    });
    const handler = new SignalCreateHandler({ octokit });

    const result = await handler.execute(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNKNOWN_ERROR');
      expect(result.error.recoverable).toBe(false);
    }
  });
});
