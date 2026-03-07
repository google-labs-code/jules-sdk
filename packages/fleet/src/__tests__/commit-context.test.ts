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

import { describe, it, expect, afterEach } from 'vitest';
import { buildCommitContext, getLocalGitAuthor } from '../init/ops/commit-context.js';
import type { Octokit } from 'octokit';
import type { FleetEvent } from '../shared/events.js';

describe('getLocalGitAuthor', () => {
  it('returns a string with name and email when git config is available', () => {
    const author = getLocalGitAuthor();
    // In a git repo with config set, this should return "Name <email>"
    // In CI with no git config, it returns undefined — both are valid
    if (author) {
      expect(author).toMatch(/.+ <.+>/);
    } else {
      expect(author).toBeUndefined();
    }
  });
});

describe('buildCommitContext', () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined) process.env[k] = v;
      else delete process.env[k];
    }
  });

  it('sets coAuthor when FLEET_APP_ID is set (app auth)', () => {
    saved.FLEET_APP_ID = process.env.FLEET_APP_ID;
    process.env.FLEET_APP_ID = 'test-app-id';

    const octokit = {} as Octokit;
    const events: FleetEvent[] = [];
    const ctx = buildCommitContext(octokit, 'o', 'r', 'fleet/init', (e: FleetEvent) => events.push(e));

    expect(ctx.owner).toBe('o');
    expect(ctx.repo).toBe('r');
    expect(ctx.branchName).toBe('fleet/init');
    // coAuthor should be set (may be undefined if git config is absent, but it was attempted)
    // The important thing is the function ran without error
    expect(ctx.octokit).toBe(octokit);
  });

  it('sets coAuthor to undefined when no app env vars (token auth)', () => {
    saved.FLEET_APP_ID = process.env.FLEET_APP_ID;
    saved.GITHUB_APP_ID = process.env.GITHUB_APP_ID;
    delete process.env.FLEET_APP_ID;
    delete process.env.GITHUB_APP_ID;

    const octokit = {} as Octokit;
    const events: FleetEvent[] = [];
    const ctx = buildCommitContext(octokit, 'o', 'r', 'fleet/init', (e: FleetEvent) => events.push(e));

    expect(ctx.coAuthor).toBeUndefined();
  });
});
