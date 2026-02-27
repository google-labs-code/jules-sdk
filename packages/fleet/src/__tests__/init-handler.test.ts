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
import { InitHandler } from '../init/handler.js';
import type { Octokit } from 'octokit';
import type { FleetEvent } from '../shared/events.js';

/** Builds a mock Octokit with configurable behavior */
function createMockOctokit(overrides: {
  /** If true, createOrUpdateFileContents throws 422 for ALL files */
  allFilesExist?: boolean;
  /** If true, createRef throws an error */
  branchCreateFails?: boolean;
  /** If true, pulls.create throws */
  prCreateFails?: boolean;
} = {}): Octokit {
  return {
    rest: {
      git: {
        getRef: vi.fn().mockResolvedValue({
          data: { object: { sha: 'abc123' } },
        }),
        createRef: overrides.branchCreateFails
          ? vi.fn().mockRejectedValue(new Error('Branch exists'))
          : vi.fn().mockResolvedValue({ data: {} }),
      },
      repos: {
        createOrUpdateFileContents: overrides.allFilesExist
          ? vi.fn().mockRejectedValue(Object.assign(new Error('Already exists'), { status: 422 }))
          : vi.fn().mockResolvedValue({ data: {} }),
      },
      pulls: {
        create: overrides.prCreateFails
          ? vi.fn().mockRejectedValue(new Error('PR create failed'))
          : vi.fn().mockResolvedValue({
              data: { html_url: 'https://github.com/o/r/pull/1', number: 1 },
            }),
      },
    },
  } as unknown as Octokit;
}

const baseInput = {
  repo: 'o/r',
  owner: 'o',
  repoName: 'r',
  baseBranch: 'main',
};

describe('InitHandler', () => {
  it('succeeds when files are committed and PR is created', async () => {
    const octokit = createMockOctokit();
    const events: FleetEvent[] = [];
    const handler = new InitHandler({ octokit, emit: (e) => events.push(e) });

    const result = await handler.execute(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prUrl).toBe('https://github.com/o/r/pull/1');
      expect(result.data.filesCreated.length).toBeGreaterThan(0);
    }

    // Should have emitted init lifecycle events
    const types = events.map((e) => e.type);
    expect(types).toContain('init:start');
    expect(types).toContain('init:branch:creating');
    expect(types).toContain('init:branch:created');
    expect(types).toContain('init:pr:creating');
    expect(types).toContain('init:pr:created');
    expect(types).toContain('init:done');
  });

  it('fails with FILE_COMMIT_FAILED when all files already exist', async () => {
    const octokit = createMockOctokit({ allFilesExist: true });
    const events: FleetEvent[] = [];
    const handler = new InitHandler({ octokit, emit: (e) => events.push(e) });

    const result = await handler.execute(baseInput);

    // Should fail — not attempt to create a PR
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FILE_COMMIT_FAILED');
      expect(result.error.message).toContain('already exist');
      expect(result.error.suggestion).toContain('already initialized');
    }

    // Should NOT have emitted PR events
    const types = events.map((e) => e.type);
    expect(types).not.toContain('init:pr:creating');
    expect(types).not.toContain('init:pr:created');
    expect(types).not.toContain('init:done');

    // Should have emitted an error event
    expect(types).toContain('error');
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    if (errorEvent && errorEvent.type === 'error') {
      expect(errorEvent.code).toBe('ALREADY_INITIALIZED');
    }
  });

  it('does not call pulls.create when all files exist', async () => {
    const octokit = createMockOctokit({ allFilesExist: true });
    const handler = new InitHandler({ octokit });

    await handler.execute(baseInput);

    // The PR API should never have been called
    expect(octokit.rest.pulls.create).not.toHaveBeenCalled();
  });

  it('emits file:skipped events for each existing file', async () => {
    const octokit = createMockOctokit({ allFilesExist: true });
    const events: FleetEvent[] = [];
    const handler = new InitHandler({ octokit, emit: (e) => events.push(e) });

    await handler.execute(baseInput);

    const skippedEvents = events.filter((e) => e.type === 'init:file:skipped');
    // At least the 3 workflow templates should be skipped
    expect(skippedEvents.length).toBeGreaterThanOrEqual(3);
  });

  it('succeeds with partial files (some exist, some new)', async () => {
    // First call succeeds, second throws 422, third succeeds, goal succeeds
    const createOrUpdate = vi.fn()
      .mockResolvedValueOnce({ data: {} }) // analyze.yml — new
      .mockRejectedValueOnce(Object.assign(new Error('exists'), { status: 422 })) // dispatch.yml — exists
      .mockResolvedValueOnce({ data: {} }) // merge.yml — new
      .mockResolvedValueOnce({ data: {} }); // example.md — new

    const octokit = {
      rest: {
        git: {
          getRef: vi.fn().mockResolvedValue({ data: { object: { sha: 'abc' } } }),
          createRef: vi.fn().mockResolvedValue({ data: {} }),
        },
        repos: { createOrUpdateFileContents: createOrUpdate },
        pulls: {
          create: vi.fn().mockResolvedValue({
            data: { html_url: 'https://github.com/o/r/pull/2', number: 2 },
          }),
        },
      },
    } as unknown as Octokit;

    const events: FleetEvent[] = [];
    const handler = new InitHandler({ octokit, emit: (e) => events.push(e) });

    const result = await handler.execute(baseInput);

    // Should succeed — some files were created
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filesCreated.length).toBe(3); // analyze + merge + example
    }

    // Should have both committed and skipped events
    const types = events.map((e) => e.type);
    expect(types).toContain('init:file:committed');
    expect(types).toContain('init:file:skipped');
    expect(types).toContain('init:pr:created');
  });

  it('returns BRANCH_CREATE_FAILED when branch creation fails', async () => {
    const octokit = createMockOctokit({ branchCreateFails: true });
    const handler = new InitHandler({ octokit });

    const result = await handler.execute(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('BRANCH_CREATE_FAILED');
    }
  });
});
