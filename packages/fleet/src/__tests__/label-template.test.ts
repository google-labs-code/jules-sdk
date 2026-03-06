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
import * as yaml from 'yaml';
import { FLEET_LABEL_TEMPLATE } from '../init/templates/label.js';

describe('FLEET_LABEL_TEMPLATE', () => {
  const parsed = yaml.parse(FLEET_LABEL_TEMPLATE.content);

  it('content is valid YAML', () => {
    expect(parsed).toBeDefined();
    expect(parsed.name).toBeDefined();
  });

  it('has a workflow name', () => {
    expect(typeof parsed.name).toBe('string');
    expect(parsed.name.length).toBeGreaterThan(0);
  });

  it('triggers on pull_request events', () => {
    expect(parsed.on).toHaveProperty('pull_request');
    expect(parsed.on.pull_request.types).toContain('opened');
    expect(parsed.on.pull_request.types).toContain('edited');
    expect(parsed.on.pull_request.types).toContain('synchronize');
  });

  it('has ubuntu-latest runner', () => {
    const jobs = Object.values(parsed.jobs) as any[];
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0]['runs-on']).toBe('ubuntu-latest');
  });

  it('references fleet-merge-ready label in steps', () => {
    const content = FLEET_LABEL_TEMPLATE.content;
    expect(content).toContain('fleet-merge-ready');
  });
});
