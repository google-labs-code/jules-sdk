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
 * Cross-template guardrail tests.
 *
 * These validate that every workflow template we ship will actually work
 * in GitHub Actions. Each rule catches a real bug we hit in production:
 *
 * - YAML validity          → garbled templates crash the workflow loader
 * - no literal \\           → backslash escaping in template strings
 *                            produced `\\` instead of shell continuations
 * - npx --package= flag    → monorepo workspace resolution picks up the
 *                            local (un-built) package instead of npm
 * - gh --repo flag          → `gh issue view <num>` needs repo context;
 *                            without --repo it calls `git remote` which
 *                            fails if checkout is missing or misconfigured
 * - valid repoPath          → must be .github/workflows/*.yml
 */

import { describe, it, expect } from 'vitest';
import * as yaml from 'yaml';
import { buildWorkflowTemplates } from '../init/templates.js';
import type { WorkflowTemplate } from '../init/templates/types.js';

// Build templates at the default 60-minute interval
const ALL_TEMPLATES = buildWorkflowTemplates(60);

// ── Helpers ─────────────────────────────────────────────────────────

/** Extract all `run:` blocks from a parsed workflow YAML */
function extractRunBlocks(parsed: Record<string, unknown>): string[] {
  const runs: string[] = [];
  const walk = (node: unknown): void => {
    if (node && typeof node === 'object') {
      if (Array.isArray(node)) {
        node.forEach(walk);
      } else {
        const record = node as Record<string, unknown>;
        if (typeof record['run'] === 'string') {
          runs.push(record['run']);
        }
        Object.values(record).forEach(walk);
      }
    }
  };
  walk(parsed);
  return runs;
}

/** Extract all step objects from a parsed workflow YAML */
function extractSteps(parsed: Record<string, unknown>): Record<string, unknown>[] {
  const steps: Record<string, unknown>[] = [];
  const walk = (node: unknown): void => {
    if (node && typeof node === 'object') {
      if (Array.isArray(node)) {
        node.forEach(walk);
      } else {
        const record = node as Record<string, unknown>;
        if ('steps' in record && Array.isArray(record['steps'])) {
          steps.push(...(record['steps'] as Record<string, unknown>[]));
        }
        Object.values(record).forEach(walk);
      }
    }
  };
  walk(parsed);
  return steps;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Workflow Template Guardrails', () => {
  // Run every guardrail against every template
  describe.each(
    ALL_TEMPLATES.map((t) => ({
      name: t.repoPath.replace('.github/workflows/', ''),
      template: t,
    })),
  )('$name', ({ template }: { name: string; template: WorkflowTemplate }) => {
    // ── Structural ─────────────────────────────────────────────

    it('has a valid .github/workflows/*.yml repoPath', () => {
      expect(template.repoPath).toMatch(/^\.github\/workflows\/[\w-]+\.yml$/);
    });

    it('content is valid YAML', () => {
      expect(() => yaml.parse(template.content)).not.toThrow();
    });

    it('has a workflow name', () => {
      const parsed = yaml.parse(template.content);
      expect(parsed.name).toBeDefined();
      expect(typeof parsed.name).toBe('string');
    });

    it('has at least one trigger', () => {
      const parsed = yaml.parse(template.content);
      expect(parsed.on).toBeDefined();
      expect(Object.keys(parsed.on).length).toBeGreaterThan(0);
    });

    it('has at least one job', () => {
      const parsed = yaml.parse(template.content);
      expect(parsed.jobs).toBeDefined();
      expect(Object.keys(parsed.jobs).length).toBeGreaterThan(0);
    });

    // ── Shell Safety ───────────────────────────────────────────

    it('run blocks have no literal double-backslash sequences', () => {
      const parsed = yaml.parse(template.content);
      const runs = extractRunBlocks(parsed);
      for (const run of runs) {
        expect(run).not.toContain('\\\\');
      }
    });

    it('run blocks have no garbled GitHub Actions expressions', () => {
      const parsed = yaml.parse(template.content);
      const runs = extractRunBlocks(parsed);
      for (const run of runs) {
        // After YAML parsing, expressions should be clean ${{ ... }}
        // NOT escaped \\${{ or $\\{\\{
        expect(run).not.toMatch(/\\\$\{\{/);
        expect(run).not.toMatch(/\$\\\{/);
      }
    });

    // ── npx Registry Resolution ────────────────────────────────

    it('npx commands use --package= flag for registry resolution', () => {
      const parsed = yaml.parse(template.content);
      const runs = extractRunBlocks(parsed);
      for (const run of runs) {
        // Find all npx invocations
        const npxCalls = run.match(/npx\s+.*@google\/jules-\w+/g) ?? [];
        for (const call of npxCalls) {
          expect(call).toContain('--package=');
        }
      }
    });

    // ── gh CLI Repo Context ────────────────────────────────────

    it('gh issue commands use --repo flag', () => {
      const parsed = yaml.parse(template.content);
      const runs = extractRunBlocks(parsed);
      for (const run of runs) {
        // Find gh issue commands that take a number (not a URL)
        // gh issue view "$ISSUE_NUMBER" needs --repo
        const ghIssueCalls = run.match(/gh issue \w+ [^-\n][^\n]*/g) ?? [];
        for (const call of ghIssueCalls) {
          expect(call).toContain('--repo');
        }
      }
    });

    // ── Permissions ────────────────────────────────────────────

    it('defines permissions (not using default token scope)', () => {
      const parsed = yaml.parse(template.content);
      // Check for top-level or per-job permissions
      const hasTopLevel = parsed.permissions !== undefined;
      const hasJobLevel = Object.values(parsed.jobs as Record<string, { permissions?: unknown }>)
        .some((job) => job.permissions !== undefined);
      expect(hasTopLevel || hasJobLevel).toBe(true);
    });
  });

  // ── Cross-template checks ──────────────────────────────────────

  it('all templates have unique repoPath values', () => {
    const paths = ALL_TEMPLATES.map((t) => t.repoPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('all templates have unique workflow names', () => {
    const names = ALL_TEMPLATES.map((t) => {
      const parsed = yaml.parse(t.content);
      return parsed.name;
    });
    expect(new Set(names).size).toBe(names.length);
  });

  // ── Secret naming consistency ──────────────────────────────────────

  it('templates use canonical FLEET_APP_PRIVATE_KEY_BASE64 env var', () => {
    for (const template of ALL_TEMPLATES) {
      const parsed = yaml.parse(template.content);
      const steps = extractSteps(parsed);
      for (const step of steps) {
        const env = (step as Record<string, unknown>).env as Record<string, string> | undefined;
        if (!env) continue;
        if (env['FLEET_APP_PRIVATE_KEY_BASE64']) {
          expect(env['FLEET_APP_PRIVATE_KEY_BASE64']).toContain('FLEET_APP_PRIVATE_KEY_BASE64');
        }
      }
    }
  });

  // ── Auth-agnostic templates ────────────────────────────────────────

  it('templates are auth-agnostic (no decode-key or create-github-app-token steps)', () => {
    for (const template of ALL_TEMPLATES) {
      expect(template.content).not.toContain('Decode private key');
      expect(template.content).not.toContain('create-github-app-token');
      expect(template.content).not.toContain('base64 -d');
    }
  });
});
