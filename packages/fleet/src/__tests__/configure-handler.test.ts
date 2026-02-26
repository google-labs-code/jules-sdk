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
import { ConfigureHandler } from '../configure/handler.js';

function createMockOctokit(overrides: Record<string, any> = {}) {
  return {
    rest: {
      issues: {
        createLabel: vi.fn().mockResolvedValue({ data: {} }),
        deleteLabel: vi.fn().mockResolvedValue({ data: {} }),
        ...overrides.issues,
      },
    },
  } as any;
}

describe('ConfigureHandler (Logic Tests)', () => {
  describe('create labels', () => {
    it('creates both fleet labels', async () => {
      const octokit = createMockOctokit();
      const handler = new ConfigureHandler({ octokit });
      const result = await handler.execute({
        resource: 'labels',
        action: 'create',
        owner: 'google',
        repo: 'sdk',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.created).toContain('fleet-merge-ready');
        expect(result.data.created).toContain('fleet');
        expect(result.data.skipped).toHaveLength(0);
      }
    });

    it('skips existing labels (422)', async () => {
      const error422 = Object.assign(new Error('Validation Failed'), {
        status: 422,
      });
      const octokit = createMockOctokit({
        issues: {
          createLabel: vi.fn().mockRejectedValue(error422),
        },
      });

      const handler = new ConfigureHandler({ octokit });
      const result = await handler.execute({
        resource: 'labels',
        action: 'create',
        owner: 'google',
        repo: 'sdk',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.created).toHaveLength(0);
        expect(result.data.skipped).toContain('fleet-merge-ready');
        expect(result.data.skipped).toContain('fleet');
      }
    });

    it('returns API error for non-422 failures', async () => {
      const error500 = Object.assign(new Error('Server Error'), {
        status: 500,
      });
      const octokit = createMockOctokit({
        issues: {
          createLabel: vi.fn().mockRejectedValue(error500),
        },
      });

      const handler = new ConfigureHandler({ octokit });
      const result = await handler.execute({
        resource: 'labels',
        action: 'create',
        owner: 'google',
        repo: 'sdk',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('GITHUB_API_ERROR');
      }
    });
  });

  describe('delete labels', () => {
    it('deletes both fleet labels', async () => {
      const octokit = createMockOctokit();
      const handler = new ConfigureHandler({ octokit });
      const result = await handler.execute({
        resource: 'labels',
        action: 'delete',
        owner: 'google',
        repo: 'sdk',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deleted).toContain('fleet-merge-ready');
        expect(result.data.deleted).toContain('fleet');
      }
    });

    it('skips non-existent labels (404)', async () => {
      const error404 = Object.assign(new Error('Not Found'), {
        status: 404,
      });
      const octokit = createMockOctokit({
        issues: {
          deleteLabel: vi.fn().mockRejectedValue(error404),
        },
      });

      const handler = new ConfigureHandler({ octokit });
      const result = await handler.execute({
        resource: 'labels',
        action: 'delete',
        owner: 'google',
        repo: 'sdk',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deleted).toHaveLength(0);
        expect(result.data.skipped).toContain('fleet-merge-ready');
        expect(result.data.skipped).toContain('fleet');
      }
    });
  });
});
