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
import { buildDispatchTemplate } from '../init/templates/dispatch.js';
import * as yaml from 'yaml';

describe('buildDispatchTemplate', () => {
  const template = buildDispatchTemplate(360);

  it('has a .yml repoPath under .github/workflows/', () => {
    expect(template.repoPath).toMatch(
      /^\.github\/workflows\/.*\.yml$/,
    );
  });

  it('content is valid YAML', () => {
    expect(() => yaml.parse(template.content)).not.toThrow();
  });

  it('references jules-fleet dispatch command', () => {
    expect(template.content).toContain('jules-fleet dispatch');
    expect(template.content).toContain('--package=@google/jules-fleet');
  });

  it('has two jobs: discover and dispatch', () => {
    const parsed = yaml.parse(template.content);
    expect(parsed.jobs.discover).toBeDefined();
    expect(parsed.jobs.dispatch).toBeDefined();
  });

  it('discover job outputs milestones', () => {
    const parsed = yaml.parse(template.content);
    expect(parsed.jobs.discover.outputs.milestones).toBeDefined();
  });

  it('dispatch job uses matrix from discover output', () => {
    const parsed = yaml.parse(template.content);
    const dispatch = parsed.jobs.dispatch;
    expect(dispatch.needs).toBe('discover');
    expect(dispatch.strategy.matrix.milestone).toContain('fromJSON');
    expect(dispatch.strategy.matrix.milestone).toContain('needs.discover.outputs.milestones');
  });

  it('milestone input is optional (not required)', () => {
    const parsed = yaml.parse(template.content);
    const milestone = parsed.on.workflow_dispatch.inputs.milestone;
    expect(milestone.required).toBe(false);
  });

  it('discover step branches on INPUT_MILESTONE', () => {
    const parsed = yaml.parse(template.content);
    const listStep = parsed.jobs.discover.steps.find(
      (s: { id?: string }) => s.id === 'list',
    );
    expect(listStep).toBeDefined();
    expect(listStep.run).toContain('if [ -n "$INPUT_MILESTONE" ]');
    expect(listStep.run).toContain('gh api');
  });

  it('dispatch job has correct permissions', () => {
    const parsed = yaml.parse(template.content);
    const perms = parsed.jobs.dispatch.permissions;
    expect(perms.contents).toBe('read');
    expect(perms.issues).toBe('write');
  });

  it('uses the provided cron interval', () => {
    const t60 = buildDispatchTemplate(60);
    const parsed60 = yaml.parse(t60.content);
    expect(parsed60.on.schedule[0].cron).toBeDefined();

    const t360 = buildDispatchTemplate(360);
    const parsed360 = yaml.parse(t360.content);
    expect(parsed360.on.schedule[0].cron).toBeDefined();

    // Different intervals should produce different cron expressions
    expect(parsed60.on.schedule[0].cron).not.toBe(parsed360.on.schedule[0].cron);
  });

  it('passes --milestone with matrix value', () => {
    const parsed = yaml.parse(template.content);
    const runStep = parsed.jobs.dispatch.steps.find(
      (s: { run?: string }) => s.run?.includes('jules-fleet'),
    );
    expect(runStep).toBeDefined();
    expect(runStep.run).toContain('--milestone');
    expect(runStep.run).toContain('matrix.milestone');
  });
});
