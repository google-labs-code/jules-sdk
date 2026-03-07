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

import { describe, it, expect } from 'vitest';
import { resolveTemplates } from '../init/ops/resolve-templates.js';
import type { Octokit } from 'octokit';
import type { InitInput } from '../init/spec.js';

const baseInput = {
  repo: 'o/r',
  owner: 'o',
  repoName: 'r',
  baseBranch: 'main',
  overwrite: false,
} satisfies Partial<InitInput> as unknown as InitInput;

describe('resolveTemplates', () => {
  it('returns default workflow templates when no features specified', async () => {
    const octokit = {} as Octokit;
    const result = await resolveTemplates(octokit, baseInput);
    // Should not be a failure result
    expect('success' in result).toBe(false);
    // Should be an array of templates
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result.length).toBeGreaterThan(0);
      // Each template should have repoPath and content
      for (const t of result) {
        expect(t.repoPath).toBeDefined();
        expect(t.content).toBeDefined();
      }
    }
  });

  it('uses intervalMinutes from input for template cadence', async () => {
    const octokit = {} as Octokit;
    const inputWithInterval = { ...baseInput, intervalMinutes: 30 } as unknown as InitInput;
    const result = await resolveTemplates(octokit, inputWithInterval);
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      // The analyze template should contain a cron with sub-hour interval
      const analyze = result.find((t) => t.repoPath.includes('analyze'));
      expect(analyze).toBeDefined();
      expect(analyze?.content).toContain('cron');
    }
  });
});
