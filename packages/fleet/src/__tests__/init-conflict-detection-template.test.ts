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
import { CONFLICT_DETECTION_TEMPLATE } from '../init/templates/conflict-detection.js';
import * as yaml from 'yaml';

describe('CONFLICT_DETECTION_TEMPLATE', () => {
  it('has a .yml repoPath under .github/workflows/', () => {
    expect(CONFLICT_DETECTION_TEMPLATE.repoPath).toMatch(
      /^\.github\/workflows\/.*\.yml$/,
    );
  });

  it('content is valid YAML', () => {
    expect(() => yaml.parse(CONFLICT_DETECTION_TEMPLATE.content)).not.toThrow();
  });

  it('references @google/jules-merge check-conflicts', () => {
    expect(CONFLICT_DETECTION_TEMPLATE.content).toContain(
      '@google/jules-merge',
    );
    expect(CONFLICT_DETECTION_TEMPLATE.content).toContain('check-conflicts');
  });

  it('has the correct permissions', () => {
    const parsed = yaml.parse(CONFLICT_DETECTION_TEMPLATE.content);
    expect(parsed.permissions).toBeDefined();
    expect(parsed.permissions.contents).toBe('read');
    expect(parsed.permissions['pull-requests']).toBe('read');
  });

  it('triggers on pull_request events', () => {
    const parsed = yaml.parse(CONFLICT_DETECTION_TEMPLATE.content);
    expect(parsed.on).toHaveProperty('pull_request');
  });

  it('includes a checkout step with fetch-depth 0', () => {
    expect(CONFLICT_DETECTION_TEMPLATE.content).toContain('fetch-depth: 0');
  });

  it('includes a merge attempt step', () => {
    expect(CONFLICT_DETECTION_TEMPLATE.content).toContain('git merge');
  });
});
