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
 * E2E tests for `fleet init` with --create-repo against real GitHub API.
 *
 * Run with: GITHUB_TOKEN=$(gh auth token) npx vitest run src/__tests__/init-e2e.test.ts
 *
 * These tests:
 *   1. Create an ephemeral private repo
 *   2. Run the full init pipeline (create branch, commit files, open PR)
 *   3. Verify the PR and committed files
 *   4. Clean up by deleting the ephemeral repo
 *
 * Skipped when GITHUB_TOKEN is not set.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { Octokit } from 'octokit';
import { InitHandler } from '../init/handler.js';
import { InitInputSchema } from '../init/spec.js';
import { resolveInput } from '../shared/cli/input.js';
import type { FleetEvent } from '../shared/events.js';
import { execSync } from 'node:child_process';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const describeE2E = GITHUB_TOKEN ? describe : describe.skip;

// Unique repo name to avoid collisions across parallel runs
const EPHEMERAL_REPO = `fleet-e2e-${Date.now()}`;

// Will be populated once we discover the authenticated user
let OWNER = '';
let repoCreated = false;

function createOctokit(): Octokit {
  return new Octokit({ auth: GITHUB_TOKEN });
}

describeE2E('Init E2E — full pipeline with repo creation', () => {
  const octokit = createOctokit();

  // ── Teardown: always delete the ephemeral repo ─────────────────
  afterAll(async () => {
    if (repoCreated && OWNER) {
      try {
        await octokit.rest.repos.delete({ owner: OWNER, repo: EPHEMERAL_REPO });
        console.log(`   🗑️  Deleted ephemeral repo ${OWNER}/${EPHEMERAL_REPO}`);
      } catch (err) {
        console.warn(`   ⚠️  Failed to delete ${OWNER}/${EPHEMERAL_REPO}:`, err);
      }
    }
  });

  // ── Discover authenticated user ────────────────────────────────
  it('discovers authenticated user', async () => {
    const { data: user } = await octokit.rest.users.getAuthenticated();
    OWNER = user.login;
    console.log(`   👤 Authenticated as: ${OWNER}`);
    expect(OWNER).toBeTruthy();
  }, 10_000);

  // ── Full init with createRepo=true ─────────────────────────────
  it('creates repo, scaffolds fleet, and opens PR', async () => {
    expect(OWNER).toBeTruthy(); // guard: previous test must pass

    const input = resolveInput(InitInputSchema, JSON.stringify({
      owner: OWNER,
      repoName: EPHEMERAL_REPO,
      baseBranch: 'main',
      createRepo: true,
      visibility: 'private',
      description: 'Ephemeral repo for fleet init e2e test — safe to delete',
      auth: 'token',
      intervalMinutes: 360,
    }));

    const events: FleetEvent[] = [];
    const handler = new InitHandler({
      octokit,
      emit: (e: FleetEvent) => {
        events.push(e);
        // Log events for visibility
        if ('type' in e) {
          console.log(`   📡 ${e.type}`);
        }
      },
    });

    const result = await handler.execute(input);
    repoCreated = true; // Mark for cleanup even if the test fails

    // ── Assertions ──
    expect(result.success).toBe(true);
    if (result.success) {
      console.log(`   ✅ PR created: ${result.data.prUrl}`);
      console.log(`   📄 Files: ${result.data.filesCreated.length}`);

      expect(result.data.repoCreated).toBe(true);
      expect(result.data.prUrl).toContain(`${OWNER}/${EPHEMERAL_REPO}/pull/`);
      expect(result.data.prNumber).toBeGreaterThan(0);
      expect(result.data.filesCreated.length).toBeGreaterThan(0);

      // Verify expected workflow files are present
      const fileNames = result.data.filesCreated;
      expect(fileNames.some((f: string) => f.includes('fleet-analyze'))).toBe(true);
      expect(fileNames.some((f: string) => f.includes('fleet-dispatch'))).toBe(true);
    }

    // Verify event lifecycle
    const types = events.map((e) => e.type);
    expect(types).toContain('init:repo:creating');
    expect(types).toContain('init:repo:created');
    expect(types).toContain('init:branch:created');
    expect(types).toContain('init:pr:created');
  }, 60_000);

  // ── Verify repo state via API ──────────────────────────────────
  it('verifies the created repo has correct properties', async () => {
    expect(OWNER).toBeTruthy();
    expect(repoCreated).toBe(true);

    const { data: repo } = await octokit.rest.repos.get({
      owner: OWNER,
      repo: EPHEMERAL_REPO,
    });

    expect(repo.private).toBe(true);
    expect(repo.description).toBe('Ephemeral repo for fleet init e2e test — safe to delete');
    console.log(`   📦 Repo: ${repo.full_name} (private=${repo.private})`);
  }, 10_000);

  // ── Verify PR contents ─────────────────────────────────────────
  it('verifies PR contains fleet workflow files', async () => {
    expect(OWNER).toBeTruthy();
    expect(repoCreated).toBe(true);

    const { data: pulls } = await octokit.rest.pulls.list({
      owner: OWNER,
      repo: EPHEMERAL_REPO,
      state: 'open',
      per_page: 1,
    });

    expect(pulls.length).toBe(1);
    const pr = pulls[0];
    console.log(`   📝 PR #${pr.number}: ${pr.title}`);
    expect(pr.title).toContain('fleet');

    // Check PR files
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner: OWNER,
      repo: EPHEMERAL_REPO,
      pull_number: pr.number,
    });

    const filePaths = files.map((f: { filename: string }) => f.filename);
    console.log(`   📂 PR files: ${filePaths.join(', ')}`);

    expect(filePaths.some((f: string) => f.includes('.github/workflows/'))).toBe(true);
    expect(filePaths.some((f: string) => f.includes('.fleet/goals/'))).toBe(true);
  }, 15_000);

  // ── Re-init with createRepo=true should skip creation ──────────
  it('skips repo creation when repo already exists', async () => {
    expect(OWNER).toBeTruthy();
    expect(repoCreated).toBe(true);

    const input = resolveInput(InitInputSchema, JSON.stringify({
      owner: OWNER,
      repoName: EPHEMERAL_REPO,
      baseBranch: 'main',
      createRepo: true,
      visibility: 'private',
      auth: 'token',
      overwrite: true, // overwrite since files exist from previous test
    }));

    const events: FleetEvent[] = [];
    const handler = new InitHandler({
      octokit,
      emit: (e: FleetEvent) => events.push(e),
    });

    const result = await handler.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      // Should NOT have created the repo again
      expect(result.data.repoCreated).toBeUndefined();
      console.log(`   ♻️  Re-init: repo existed, skipped creation. PR: ${result.data.prUrl}`);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('init:repo:exists');
    expect(types).not.toContain('init:repo:creating');
  }, 60_000);
});

// ── CLI binary tests: --json bypasses wizard ─────────────────────
// These test the actual built CLI binary to verify --json skips the
// wizard's git remote detection and uses the JSON payload directly.

describeE2E('Init E2E — CLI binary with --json', () => {
  const octokit = createOctokit();

  const CLI_REPO = `fleet-e2e-cli-${Date.now()}`;
  let cliOwner = '';
  let cliRepoCreated = false;

  afterAll(async () => {
    if (cliRepoCreated && cliOwner) {
      try {
        await octokit.rest.repos.delete({ owner: cliOwner, repo: CLI_REPO });
        console.log(`   🗑️  Deleted CLI test repo ${cliOwner}/${CLI_REPO}`);
      } catch (err) {
        console.warn(`   ⚠️  Failed to delete ${cliOwner}/${CLI_REPO}:`, err);
      }
    }
  });

  it('--json bypasses wizard and targets the correct repo', async () => {
    // Discover owner
    const { data: user } = await octokit.rest.users.getAuthenticated();
    cliOwner = user.login;

    // Create a test repo first
    await octokit.rest.repos.createForAuthenticatedUser({
      name: CLI_REPO,
      private: true,
      auto_init: true,
      description: 'CLI --json bypass e2e test',
    });
    cliRepoCreated = true;
    console.log(`   📦 Created ${cliOwner}/${CLI_REPO}`);

    // Run the CLI binary with --json from a DIFFERENT directory
    // (to prove it doesn't use git remote detection)
    const cliPath = new URL('../../dist/cli/index.mjs', import.meta.url).pathname;
    const jsonPayload = JSON.stringify({
      owner: cliOwner,
      repoName: CLI_REPO,
      baseBranch: 'main',
      auth: 'token',
    });

    const output = execSync(
      `node ${cliPath} init --json '${jsonPayload}' --output json`,
      {
        encoding: 'utf-8',
        timeout: 60_000,
        env: {
          ...process.env,
          GITHUB_TOKEN: GITHUB_TOKEN!,
          // Ensure App env vars don't interfere
          GITHUB_APP_ID: undefined,
          GITHUB_APP_INSTALLATION_ID: undefined,
          GITHUB_APP_PRIVATE_KEY_BASE64: undefined,
          FLEET_APP_ID: undefined,
          FLEET_APP_INSTALLATION_ID: undefined,
          FLEET_APP_PRIVATE_KEY: undefined,
        },
        cwd: '/tmp', // Deliberately NOT in a git repo
      },
    ).trim();

    console.log(`   📤 CLI output (last 500 chars): ${output.slice(-500)}`);

    // Extract the JSON result from the output.
    // The renderer may output decorative text before and after the JSON.
    // Look for the {"success": pattern that starts our result envelope.
    const jsonStart = output.indexOf('{"success"');
    if (jsonStart === -1) {
      // Try pretty-printed format
      const prettyStart = output.indexOf('{\n  "success"');
      expect(prettyStart).toBeGreaterThan(-1);
      // Find the matching closing brace by counting braces
      let depth = 0;
      let jsonEnd = prettyStart;
      for (let i = prettyStart; i < output.length; i++) {
        if (output[i] === '{') depth++;
        if (output[i] === '}') depth--;
        if (depth === 0) { jsonEnd = i + 1; break; }
      }
      const result = JSON.parse(output.slice(prettyStart, jsonEnd));
      console.log(`   ✅ CLI --json result: ${JSON.stringify(result, null, 2)}`);
      expect(result.success).toBe(true);
      expect(result.data.prUrl).toContain(`${cliOwner}/${CLI_REPO}/pull/`);
      expect(result.data.filesCreated.length).toBeGreaterThan(0);
      return;
    }

    // Compact JSON — find end by brace counting
    let depth = 0;
    let jsonEnd = jsonStart;
    for (let i = jsonStart; i < output.length; i++) {
      if (output[i] === '{') depth++;
      if (output[i] === '}') depth--;
      if (depth === 0) { jsonEnd = i + 1; break; }
    }
    const result = JSON.parse(output.slice(jsonStart, jsonEnd));

    console.log(`   ✅ CLI --json result: ${JSON.stringify(result, null, 2)}`);

    expect(result.success).toBe(true);
    expect(result.data.prUrl).toContain(`${cliOwner}/${CLI_REPO}/pull/`);
    expect(result.data.filesCreated.length).toBeGreaterThan(0);
  }, 60_000);
});
