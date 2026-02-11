import type { AnalyzeIssuesPromptOptions } from "../types.js";

export function analyzeIssuesPrompt({
  owner,
  repo,
  issuesMarkdown,
}: AnalyzeIssuesPromptOptions): string {
  const now = new Date();
  const YYYY_MM_DD = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}_${String(now.getDate()).padStart(2, "0")}`;

  return `Analyze ${owner}/${repo} open issues and produce implementation tasks.

You are a senior software engineer performing deep technical triage on GitHub issues from a single repository. You have access to the full codebase. Your job is not just to classify issues — it is to diagnose root causes at the code level, propose concrete implementations, and produce task prompts detailed enough that another engineer could start coding immediately.

## Your Input

Below is a markdown document containing all open issues for **${owner}/${repo}**. Each issue includes its number, title, author, labels, timestamps, and full description.

## Issues to analyze
${issuesMarkdown}

## Your Task

Perform a three-phase analysis: **Investigate**, **Architect**, and **Plan**.

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

- **No two tasks may modify the same file.** If two root causes require changes to the same file, merge them into one task.
- Produce a **File Ownership Matrix** showing exactly which task owns which files. Verify no file appears twice.

#### issue_tasks.md structure

\`\`\`markdown
# Issue Analysis: ${owner}/${repo}

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
| \\\`src/c.ts\\\` | 2 | Modify |

## Unaddressable Issues

Issues that require changes outside this repository (backend API, infrastructure, product decisions):

| Issue | Reason | Suggested Owner |
|-------|--------|-----------------|
| #18 | Requires backend API to support \\\`requireApproval: false\\\` | Backend team |
\`\`\`

#### issue_tasks.json schema

\`\`\`json
{
  "repo": "${owner}/${repo}",
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
      "risk": "low | medium | high",
      "prompt": "A highly detailed, code-rich, self-contained prompt for a coding agent. This prompt must include: 1. The exact files to modify and create 2. The root cause explanation with relevant code snippets from the current codebase 3. The proposed implementation with full code examples 4. Before/after diffs showing the integration 5. Test scenarios with expected behavior 6. Acceptance criteria the PR must meet. The agent receiving this prompt has full repo access but no context about other tasks. Include everything it needs."
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
    "src/retry.ts": "task-kebab-id"
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

---

## Phase 4: Dispatch

After you have written both \`.fleet/${YYYY_MM_DD}/issue_tasks.md\` and \`.fleet/${YYYY_MM_DD}/issue_tasks.json\`, run the orchestrator to spawn parallel Jules sessions for each task:

\`\`\`bash
bun scripts/fleet/orchestrator.ts
\`\`\`

This script reads the \`tasks\` array from the JSON file, creates a Jules session for each task using its \`prompt\` field, and logs the resulting session IDs. **Do not skip this step** — the analysis is only complete once the sub-tasks have been dispatched.`;
}
