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
import { parseGoalContent } from '../analyze/goals.js';

describe('parseGoalContent', () => {
  it('parses frontmatter and body', () => {
    const content = `---
milestone: "1"
---

# My Goal

Do something useful.`;

    const result = parseGoalContent(content);
    expect(result.config.milestone).toBe('1');
    expect(result.body).toContain('# My Goal');
    expect(result.body).toContain('Do something useful.');
  });

  it('handles numeric milestone', () => {
    const content = `---
milestone: 42
---

Body here.`;

    const result = parseGoalContent(content);
    expect(result.config.milestone).toBe('42');
  });

  it('returns empty config when no frontmatter', () => {
    const content = '# Just a markdown file\n\nNo frontmatter here.';
    const result = parseGoalContent(content);
    expect(result.config).toEqual({});
    expect(result.body).toBe('# Just a markdown file\n\nNo frontmatter here.');
  });

  it('handles unclosed frontmatter gracefully', () => {
    const content = '---\nmilestone: "1"\nBody without closing delimiter';
    const result = parseGoalContent(content);
    // Unclosed frontmatter treated as no frontmatter
    expect(result.config).toEqual({});
  });

  it('handles empty content', () => {
    const result = parseGoalContent('');
    expect(result.config).toEqual({});
    expect(result.body).toBe('');
  });

  it('handles frontmatter with empty body', () => {
    const content = `---
milestone: "5"
---`;

    const result = parseGoalContent(content);
    expect(result.config.milestone).toBe('5');
    expect(result.body).toBe('');
  });

  it('extracts verification commands from ## Verification section', () => {
    const content = `---
milestone: "1"
---
# My Goal

Some description.

## Verification
- \`python -m pytest tests/ -v\`
- \`python -m mypy src/ --strict\`
- \`python -m build --sdist\`

## Assessment Hints
Some hints here.`;

    const result = parseGoalContent(content);
    expect(result.config.verification).toEqual([
      'python -m pytest tests/ -v',
      'python -m mypy src/ --strict',
      'python -m build --sdist',
    ]);
  });

  it('returns undefined when no Verification section exists', () => {
    const content = `# My Goal

## Diagnostics
- \`npm test\``;

    const result = parseGoalContent(content);
    expect(result.config.verification).toBeUndefined();
  });

  it('returns undefined for empty Verification section', () => {
    const content = `# My Goal

## Verification

## Next Section`;

    const result = parseGoalContent(content);
    expect(result.config.verification).toBeUndefined();
  });
});
