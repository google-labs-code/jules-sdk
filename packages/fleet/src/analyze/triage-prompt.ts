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
# Triage

Triage all open issues in **${repoFullName}** that are not assigned to a milestone.
For each, determine actionability, root cause, priority, and grouping potential.

## Insight Hints
- For non-actionable issues, report them as insights with the reason they
  were skipped and the suggested owner.

## Constraints
- Only create signals for work that does NOT already have an open issue or recent PR.
- Every assessment must include a \`Target Files\` section listing the exact files a worker agent should modify.
- Keep tasks small and isolated — one logical change per issue.
- Apply the \`fleet\` tag to every created signal.
- If multiple issues share the same root cause or touch the same files, group them into a single task to avoid merge conflicts.
`;
}
