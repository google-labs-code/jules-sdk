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
 * Built-in triage goal.
 *
 * When `.fleet/goals/triage.md` doesn't exist, the analyze command
 * auto-injects this prompt to triage all open issues that are not
 * associated with a milestone.
 *
 * Users override this by creating their own `triage.md` in the goals dir.
 */

/** The reserved filename. If a user creates this, it overrides the built-in. */
export const TRIAGE_GOAL_FILENAME = 'triage.md';

/**
 * Returns the built-in triage prompt content.
 * This is the goal directive telling the analyzer what to look for.
 */
export function getBuiltInTriagePrompt(repoFullName: string): string {
  return `\
Triage all open issues in **${repoFullName}** that are not assigned to a milestone.

## Directive

Scan every open issue without a milestone. For each, determine:

1. **Is this actionable?** Can a developer implement a fix within the codebase, or does it require external changes (backend API, infrastructure, product decisions)?
2. **What is the root cause?** Trace the reported behavior to specific files and functions.
3. **What is the priority?** Rate severity as critical/high/medium/low based on user impact and code health.
4. **Can it be grouped?** If multiple issues share the same root cause or touch the same files, they should become a single task to avoid merge conflicts.

## Constraints

- Only create issues for work that does NOT already have an open issue or recent PR.
- Every created issue must include a \`Target Files\` section listing the exact files a worker agent should modify.
- Keep tasks small and isolated — one logical change per issue.
- Apply the \`fleet\` label to every created issue.

## Output

For each actionable insight, create a GitHub issue using:

\`\`\`bash
gh issue create \\
  --title "[Fleet Execution] <Specific Task Title>" \\
  --label "fleet" \\
  --body-file <path_to_markdown_file>
\`\`\`

For non-actionable issues, include them in your final report with the reason they were skipped and the suggested owner.
`;
}
