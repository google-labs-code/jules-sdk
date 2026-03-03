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
import { buildMergeTemplate } from '../init/templates/merge.js';
import * as yaml from 'yaml';

describe('buildMergeTemplate', () => {
  const template = buildMergeTemplate(60);

  it('has a .yml repoPath under .github/workflows/', () => {
    expect(template.repoPath).toMatch(
      /^\.github\/workflows\/.*\.yml$/,
    );
  });

  it('content is valid YAML', () => {
    expect(() => yaml.parse(template.content)).not.toThrow();
  });

  it('references @google/jules-fleet merge', () => {
    expect(template.content).toContain('@google/jules-fleet merge');
  });

  it('has the correct permissions', () => {
    const parsed = yaml.parse(template.content);
    const perms = parsed.jobs.merge.permissions;
    expect(perms.contents).toBe('write');
    expect(perms['pull-requests']).toBe('write');
    expect(perms.issues).toBe('write');
  });

  it('has redispatch input with default true', () => {
    const parsed = yaml.parse(template.content);
    const redispatch = parsed.on.workflow_dispatch.inputs.redispatch;
    expect(redispatch.type).toBe('boolean');
    expect(redispatch.default).toBe(true);
  });

  // Regression: backslash line-continuations in YAML run blocks produced
  // literal \\ characters instead of shell line-continuations, causing
  // all args (--mode, --run-id, --redispatch) to be garbled/ignored.
  it('run block has no literal backslash-backslash sequences', () => {
    const parsed = yaml.parse(template.content);
    const runStep = parsed.jobs.merge.steps.find(
      (s: { run?: string }) => s.run?.includes('jules-fleet'),
    );
    expect(runStep).toBeDefined();
    expect(runStep.run).not.toContain('\\\\');
  });

  // Regression: --redispatch must be the default for schedule/workflow_run
  // triggers where inputs.redispatch is empty. The template should default
  // REDISPATCH_FLAG to "--redispatch" and only clear it on explicit "false".
  it('defaults --redispatch ON (only disables on explicit false)', () => {
    const parsed = yaml.parse(template.content);
    const runStep = parsed.jobs.merge.steps.find(
      (s: { run?: string }) => s.run?.includes('jules-fleet'),
    );
    expect(runStep.run).toContain('REDISPATCH_FLAG="--redispatch"');
    expect(runStep.run).toContain('= "false"');
    expect(runStep.run).not.toContain('= "true"');
  });

  it('passes $REDISPATCH_FLAG to the npx command', () => {
    const parsed = yaml.parse(template.content);
    const runStep = parsed.jobs.merge.steps.find(
      (s: { run?: string }) => s.run?.includes('jules-fleet'),
    );
    expect(runStep.run).toContain('$REDISPATCH_FLAG');
  });

  it('uses the provided cron interval', () => {
    const t60 = buildMergeTemplate(60);
    const parsed60 = yaml.parse(t60.content);
    expect(parsed60.on.schedule[0].cron).toBeDefined();

    const t360 = buildMergeTemplate(360);
    const parsed360 = yaml.parse(t360.content);
    expect(parsed360.on.schedule[0].cron).toBeDefined();

    // Different intervals should produce different cron expressions
    expect(parsed60.on.schedule[0].cron).not.toBe(parsed360.on.schedule[0].cron);
  });
});
