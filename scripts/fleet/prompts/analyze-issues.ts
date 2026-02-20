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

import type { AnalyzeIssuesPromptOptions } from "../types.js";

export function analyzeIssuesPrompt({
  issuesMarkdown,
  repoFullName,
}: AnalyzeIssuesPromptOptions): string {
  const now = new Date();
  const YYYY_MM_DD = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}_${String(now.getDate()).padStart(2, "0")}`;

  return `Analyze ${repoFullName} open issues and produce implementation tasks.

You are a senior software engineer performing deep technical triage on GitHub issues from a single repository. You have access to the full codebase. Your job is not just to classify issues — it is to diagnose root causes at the code level, propose concrete implementations, and produce task prompts detailed enough that another engineer could start coding immediately.

## Your Input

Below is a markdown document containing all open issues for **${repoFullName}**. Each issue includes its number, title, author, labels, timestamps, and full description.

## Issues to analyze
${issuesMarkdown}

## Your Task

Perform a four-phase analysis: **Investigate**, **Architect**, **Plan**, and **Dispatch**

---

### Phase 1: Investigate

For each issue, trace the reported behavior to its source in the codebase. Produce a **code-level diagnosis**, not a summary.

For each issue you must:

1. **Identify the exact code path** that causes the reported behavior. Reference specific files, functions, and line ranges.
2. **Explain the mechanism** — why does this code produce this symptom? Show the relevant code snippet and annotate what goes wrong.
3. **Determine the root cause category**: Is this a bug, a missing feature, an architectural gap, error handling omission, race condition, or documentation gap?

Example of the depth expected:

\`\`\`markdown
### Issue #19: Streaming 404 after session creation

**Code path:** \\\`src/session.ts → stream() → fetchActivities() → GET /sessions/{id}/activities\\\`

**Mechanism:** When \\\`stream()\\\` is called immediately after session creation, the activities endpoint hasn't been provisioned yet. The current implementation in \\\`fetchActivities()\\\` makes a single request with no retry logic:

\\\`\\\`\\\`typescript
// src/activities.ts:42-48
async function fetchActivities(sessionId: string) {
  const response = await fetch(\\\`\\\${BASE_URL}/sessions/\\\${sessionId}/activities\\\`);
  if (!response.ok) {
    throw new ApiError(response.status, await response.json());  // ← throws immediately on 404
  }
  return response.json();
}
\\\`\\\`\\\`

The 404 is not a "real" error — it's a timing issue. The session exists (creation returned 200) but the activities sub-resource has eventual consistency.

**Root cause:** Missing retry-with-backoff for transient 404s in the activity streaming pipeline.
\`\`\`

After investigating each issue individually, **cross-reference** them to find issues that share the same root cause or code path. Group related issues together.

---

### Phase 2: Architect

For each root cause group, design a **concrete solution** with implementation details. This is not "add better error handling" — this is "here is the function signature, the retry logic, and how it integrates."

For each solution you must provide:

1. **Proposed implementation** — actual TypeScript/code showing the solution. This should be close to production-ready, not pseudocode.
2. **Integration points** — exactly where in the existing code this gets wired in, with before/after snippets.
3. **Edge cases and risks** — what could go wrong, what assumptions you're making.
4. **Test scenarios** — specific test cases that validate the fix.

Example of the depth expected:

\`\`\`markdown
### Solution: Retry-aware activity streaming

**Files modified:** \\\`src/activities.ts\\\`, \\\`src/retry.ts\\\` (new)

**Implementation:**

\\\`\\\`\\\`typescript
// NEW: src/retry.ts
interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryOn: (status: number) => boolean;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (!options.retryOn(err.status)) throw err;
      const delay = Math.min(
        options.baseDelayMs * Math.pow(2, attempt),
        options.maxDelayMs
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
\\\`\\\`\\\`

**Integration (before → after):**

\\\`\\\`\\\`diff
// src/activities.ts
- async function fetchActivities(sessionId: string) {
-   const response = await fetch(\\\`\\\${BASE_URL}/sessions/\\\${sessionId}/activities\\\`);
-   if (!response.ok) throw new ApiError(response.status, await response.json());
-   return response.json();
- }
+ async function fetchActivities(sessionId: string) {
+   return withRetry(
+     async () => {
+       const response = await fetch(\\\`\\\${BASE_URL}/sessions/\\\${sessionId}/activities\\\`);
+       if (!response.ok) throw new ApiError(response.status, await response.json());
+       return response.json();
+     },
+     { maxAttempts: 10, baseDelayMs: 1000, maxDelayMs: 30000, retryOn: (s) => s === 404 }
+   );
+ }
\\\`\\\`\\\`

**Test scenarios:**
1. Activity endpoint returns 404 three times then 200 → stream yields activities
2. Activity endpoint returns 404 for all attempts → throws after max retries
3. Activity endpoint returns 500 → throws immediately (not retried)
4. Activity endpoint returns 200 immediately → no retry delay
\`\`\`

---

### Phase 3: Plan

Produce two files in the target repository:

- \`.fleet/${YYYY_MM_DD}/issue_tasks.md\`
- \`.fleet/${YYYY_MM_DD}/issue_tasks.json\`

#### Merge conflict avoidance rule

These tasks will be executed as **parallel agents**, each creating a separate PR against the same branch. If two tasks modify the same file, they **will** create merge conflicts. Therefore:

- **No two tasks may modify the same file, including test files.** If two root causes require changes to the same source file or test file, merge them into one task.
- For each source file in a task, identify its corresponding test file(s) and include them in the ownership matrix.
- Produce a **File Ownership Matrix** showing exactly which task owns which source and test files. Verify no file appears twice.

#### Coupling analysis

Before finalizing tasks, check for **implicitly coupled files** — files not directly in a task's file list but tightly coupled to it:

- **Test files** that exercise code from multiple tasks (e.g., a shared integration test, a test file with a shared mock server)
- **Barrel exports** (\`index.ts\`) that re-export from files owned by different tasks
- **Shared utilities** imported by files in different tasks

If any coupled file appears in more than one task's dependency cone, **merge those tasks into one.** It is better to have fewer, larger tasks than to risk merge conflicts.

#### issue_tasks.md structure

\`\`\`markdown
# Issue Analysis: ${repoFullName}

> Analyzed N issues on ${now.toISOString()}

## Executive Summary

[2-3 sentences: how many root causes found, how many are addressable, overall health assessment]

## Root Cause Analysis

### RC-1: [Root cause title]

**Related issues:** #X, #Y, #Z
**Severity:** Critical / High / Medium / Low
**Files involved:** \\\`src/file.ts\\\`, \\\`src/other.ts\\\`

#### Diagnosis

[Code-level explanation with snippets showing the problematic code path]

#### Proposed Solution

[Full implementation with code, diffs, integration points as described in Phase 2]

#### Test Plan

[Specific test scenarios with inputs and expected outputs]

---

### RC-2: [Root cause title]
...

## Task Plan

| # | Task | Root Cause | Issues | Files | Risk |
|---|------|-----------|--------|-------|------|
| 1 | [title] | RC-1 | #X, #Y | \\\`src/a.ts\\\`, \\\`src/b.ts\\\` | Medium |
| 2 | [title] | RC-2 | #Z | \\\`src/c.ts\\\` | Low |

## File Ownership Matrix

| File | Task | Change Type |
|------|------|-------------|
| \\\`src/a.ts\\\` | 1 | Modify |
| \\\`src/b.ts\\\` | 1 | Modify |
| \\\`src/retry.ts\\\` | 1 | Create |
| \\\`tests/a.test.ts\\\` | 1 | Modify |
| \\\`src/c.ts\\\` | 2 | Modify |
| \\\`tests/c.test.ts\\\` | 2 | Modify |

## Unaddressable Issues

Issues that require changes outside this repository (backend API, infrastructure, product decisions):

| Issue | Reason | Suggested Owner |
|-------|--------|-----------------|
| #18 | Requires backend API to support \\\`requireApproval: false\\\` | Backend team |
\`\`\`

#### issue_tasks.json schema

\`\`\`json
{
  "repo": "${repoFullName}",
  "analyzed_at": "ISO-8601 timestamp",
  "root_causes": [
    {
      "id": "rc-kebab-id",
      "title": "Human readable title",
      "severity": "critical | high | medium | low",
      "issues": [19, 23],
      "files": ["src/polling.ts", "src/session.ts"],
      "description": "Brief explanation of root cause",
      "solution_summary": "Brief description of the proposed fix approach"
    }
  ],
  "tasks": [
    {
      "id": "task-kebab-id",
      "title": "Human readable task title",
      "root_cause": "rc-kebab-id",
      "issues": [19, 23],
      "files": ["src/polling.ts", "src/session.ts"],
      "new_files": ["src/retry.ts"],
      "test_files": ["tests/polling.test.ts", "tests/session.test.ts"],
      "risk": "low | medium | high",
      "prompt": "A highly detailed, code-rich, self-contained prompt for a coding agent. This prompt must include: 1. The exact files to modify and create 2. The exact test files to modify (and ONLY these test files) 3. The root cause explanation with relevant code snippets from the current codebase 4. The proposed implementation with full code examples 5. Before/after diffs showing the integration 6. Test scenarios with expected behavior 7. Acceptance criteria the PR must meet 8. A FILE BOUNDARY rule: 'You may ONLY modify the files listed above. If a test file outside your boundary fails, you must make your source changes backward-compatible so the existing test passes unmodified. Do NOT rename, move, or delete any files outside your boundary.' The agent receiving this prompt has full repo access but no context about other tasks. Include everything it needs."
    }
  ],
  "unaddressable": [
    {
      "issue": 18,
      "reason": "Requires backend API change — FAILED_PRECONDITION is server-side enforcement",
      "suggested_owner": "Backend team"
    }
  ],
  "file_ownership": {
    "src/polling.ts": "task-kebab-id",
    "src/session.ts": "task-kebab-id",
    "src/retry.ts": "task-kebab-id",
    "tests/polling.test.ts": "task-kebab-id",
    "tests/session.test.ts": "task-kebab-id"
  }
}
\`\`\`

## Critical Rules

1. **Show your work in code.** Every diagnosis must reference specific files, functions, and line ranges. Every solution must include implementation code, not descriptions.
2. **Never split a file across tasks.** If two issues need changes to the same file, combine them into one task.
3. **Task prompts must be code-rich and self-contained.** Each prompt is sent to a coding agent that has repo access but zero context about the analysis. Include code snippets, diffs, function signatures, and acceptance criteria.
4. **Use exact file paths** from the repository. Do not guess paths.
5. **Mark issues as unaddressable** if they require changes outside this repository's control. Provide the reasoning and the suggested owner.
6. **Order tasks by risk** — lowest risk first, so easy wins merge before complex changes.
7. **Diffs must be valid.** Before/after code must reflect the actual current codebase, not approximations.
8. **Test files must be in the ownership matrix.** For every source file a task modifies, include its corresponding test file(s) in both the task's \`test_files\` array and the \`file_ownership\` map. No test file may appear in more than one task.
9. **Test boundary: tasks must not touch files outside their ownership.** Each task's prompt must instruct the agent to ONLY modify files listed in its \`files\`, \`new_files\`, and \`test_files\` arrays. If a test outside the boundary fails, the agent must make its implementation backward-compatible rather than modifying the unowned test.

---

## Phase 4: Dispatch

After you have written both \`.fleet/${YYYY_MM_DD}/issue_tasks.md\` and \`.fleet/${YYYY_MM_DD}/issue_tasks.json\`, run the dispatcher to spawn parallel Jules sessions for each task:

\`\`\`bash
bun run scripts/fleet/fleet-dispatch.ts
\`\`\`

This script reads the \`tasks\` array from the JSON file, creates a Jules session for each task using its \`prompt\` field, and logs the resulting session IDs. **Do not skip this step** — the analysis is only complete once the sub-tasks have been dispatched.`;
}
