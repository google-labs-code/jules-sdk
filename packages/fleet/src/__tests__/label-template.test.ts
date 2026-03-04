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
import { FLEET_LABEL_TEMPLATE } from '../init/templates/label.js';

describe('FLEET_LABEL_TEMPLATE', () => {
  it('generates valid YAML', () => {
    const content = FLEET_LABEL_TEMPLATE.content;

    expect(content).toContain('name: Fleet Label PR');
    expect(content).toContain('pull_request:');
    expect(content).toContain('runs-on: ubuntu-latest');
    expect(content).toContain('gh pr edit');
    expect(content).toContain('fleet-merge-ready');
    expect(content).toContain('gh issue view "$ISSUE_NUMBER"');
  });

  it('triggers on opened, edited, and synchronize', () => {
    const content = FLEET_LABEL_TEMPLATE.content;
    expect(content).toContain('types: [opened, edited, synchronize]');
  });
});
