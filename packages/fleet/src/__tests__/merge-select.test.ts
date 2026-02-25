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
import { selectByLabel } from '../merge/select/by-label.js';
import { selectByFleetRun } from '../merge/select/by-fleet-run.js';

function createMockOctokit(pulls: any[] = []) {
  return {
    rest: {
      pulls: {
        list: vi.fn().mockResolvedValue({ data: pulls }),
      },
    },
  } as any;
}

function makePR(
  number: number,
  labels: string[] = [],
  body: string | null = null,
) {
  return {
    number,
    head: { ref: `branch-${number}`, sha: `sha-${number}` },
    body,
    labels: labels.map((name) => ({ name })),
  };
}

describe('selectByLabel', () => {
  it('returns PRs with fleet-merge-ready label, sorted', async () => {
    const octokit = createMockOctokit([
      makePR(93, ['fleet-merge-ready']),
      makePR(92, ['fleet-merge-ready']),
      makePR(91, ['other-label']),
    ]);

    const result = await selectByLabel(octokit, 'google', 'sdk', 'main');
    expect(result).toHaveLength(2);
    expect(result[0].number).toBe(92);
    expect(result[1].number).toBe(93);
  });

  it('returns empty array when no labeled PRs', async () => {
    const octokit = createMockOctokit([
      makePR(91, ['other-label']),
    ]);

    const result = await selectByLabel(octokit, 'google', 'sdk', 'main');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when no PRs', async () => {
    const octokit = createMockOctokit([]);
    const result = await selectByLabel(octokit, 'google', 'sdk', 'main');
    expect(result).toHaveLength(0);
  });
});

describe('selectByFleetRun', () => {
  it('matches PRs containing fleet-run marker', async () => {
    const octokit = createMockOctokit([
      makePR(92, [], '<!-- fleet-run: fleet-20260225-abc123 -->'),
      makePR(93, [], 'no marker here'),
    ]);

    const result = await selectByFleetRun(
      octokit, 'google', 'sdk', 'main', 'fleet-20260225-abc123',
    );
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(92);
  });

  it('ignores PRs with different run IDs', async () => {
    const octokit = createMockOctokit([
      makePR(92, [], '<!-- fleet-run: fleet-DIFFERENT -->'),
    ]);

    const result = await selectByFleetRun(
      octokit, 'google', 'sdk', 'main', 'fleet-20260225-abc123',
    );
    expect(result).toHaveLength(0);
  });

  it('returns empty when no PRs match', async () => {
    const octokit = createMockOctokit([]);
    const result = await selectByFleetRun(
      octokit, 'google', 'sdk', 'main', 'fleet-id',
    );
    expect(result).toHaveLength(0);
  });
});
