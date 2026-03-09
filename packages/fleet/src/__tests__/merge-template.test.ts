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

  it('references jules-fleet merge command', () => {
    expect(template.content).toContain('jules-fleet merge');
    expect(template.content).toContain('--package=@google/jules-fleet');
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

  it('default auth does NOT include decode/app-token steps', () => {
    const parsed = yaml.parse(template.content);
    const steps = parsed.jobs.merge.steps;
    expect(steps.find((s: { name?: string }) => s.name === 'Decode private key')).toBeUndefined();
    expect(steps.find((s: { uses?: string }) => s.uses?.includes('create-github-app-token'))).toBeUndefined();
  });

  it('default auth uses secrets.GITHUB_TOKEN', () => {
    const parsed = yaml.parse(template.content);
    const runStep = parsed.jobs.merge.steps.find(
      (s: { run?: string }) => s.run?.includes('jules-fleet'),
    );
    expect(runStep.env.GITHUB_TOKEN).toContain('secrets.GITHUB_TOKEN');
  });

  // Regression: workflow_run trigger creates a feedback loop —
  // redispatched PRs trigger Conflict Detection → Fleet Merge → more redispatches.
  it('does NOT include a workflow_run trigger', () => {
    const parsed = yaml.parse(template.content);
    expect(parsed.on.workflow_run).toBeUndefined();
  });

  it('sets cancel-in-progress to true', () => {
    const parsed = yaml.parse(template.content);
    expect(parsed.concurrency['cancel-in-progress']).toBe(true);
  });
});

describe('buildMergeTemplate with auth=app', () => {
  const template = buildMergeTemplate(60, 'app');

  it('content is valid YAML', () => {
    expect(() => yaml.parse(template.content)).not.toThrow();
  });

  it('includes a Decode private key step', () => {
    const parsed = yaml.parse(template.content);
    const steps = parsed.jobs.merge.steps;
    const decodeStep = steps.find((s: { name?: string }) => s.name === 'Decode private key');
    expect(decodeStep).toBeDefined();
    expect(decodeStep.run).toContain('base64 -d');
    expect(decodeStep.run).toContain('GITHUB_OUTPUT');
  });

  it('includes create-github-app-token step', () => {
    const parsed = yaml.parse(template.content);
    const steps = parsed.jobs.merge.steps;
    const tokenStep = steps.find((s: { uses?: string }) => s.uses?.includes('create-github-app-token'));
    expect(tokenStep).toBeDefined();
    expect(tokenStep.with['app-id']).toContain('FLEET_APP_ID');
    expect(tokenStep.with['private-key']).toContain('decode-key.outputs.pem');
  });

  it('uses app token as GITHUB_TOKEN', () => {
    const parsed = yaml.parse(template.content);
    const runStep = parsed.jobs.merge.steps.find(
      (s: { run?: string }) => s.run?.includes('jules-fleet'),
    );
    expect(runStep.env.GITHUB_TOKEN).toContain('app-token.outputs.token');
  });

  it('uses FLEET_APP_PRIVATE_KEY secret name', () => {
    const parsed = yaml.parse(template.content);
    const runStep = parsed.jobs.merge.steps.find(
      (s: { run?: string }) => s.run?.includes('jules-fleet'),
    );
    expect(runStep.env.FLEET_APP_PRIVATE_KEY).toContain('FLEET_APP_PRIVATE_KEY');
  });
});
