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

/** Options for building the analyzer prompt */
export interface AnalyzerPromptOptions {
  goalInstructions: string;
  openContext: string;
  closedContext: string;
  prContext?: string;
  milestoneTitle?: string;
  milestoneId?: string;
}

// ── Prompt Constants ────────────────────────────────────────────────

const SYSTEM_PREAMBLE = `\
You are a senior software architect performing a rigorous code analysis against a set of goal directives. Your job is to identify gaps and create GitHub issues for each actionable task.`;

const DEDUP_RULES = `\
**Deduplication Rules (MANDATORY):**
1. **Closed Issue = Work Already Done.** Do NOT recreate issues that have been closed.
2. **Open Issue = Work In Progress.** Someone is already handling it. Do NOT create a duplicate.
3. **PR with "Fixes #N" = Issue Being Resolved.** If a PR references an issue, that issue is handled. Do NOT create a new issue for the same thing.
4. **When in doubt, skip it.** It is better to miss a real gap than to create a duplicate that wastes engineering time.`;

const PHASE_0_VERIFY = `\
### Phase 0: Reality Verification
Before planning new tasks, verify the current state of the repository against your goal directives.

The full details of every open and recently closed issue are provided above in "Historical Context (The Map)". Read each issue's **Objective** and **Proposed Implementation** sections carefully to understand what work is already planned or completed.

Then, inspect the actual source files to confirm whether the required changes or architectural gaps currently exist. Cross-reference your findings with both the Open and Recently Closed Issues to ensure the work has not already been completed or is not already tracked.

Proceed to Phase 1 exclusively for gaps that are:
1. Demonstrably present in the live codebase today, AND
2. Not already covered by an existing open issue's Objective.`;

const PHASE_1_INVESTIGATE = `\
### Phase 1: Investigate
Trace identified gaps directly to their source in the codebase. Produce a code-level diagnosis.

For every identified issue, you must:
1. **Identify the exact code path:** Map the execution flow referencing specific files, functions, and line ranges.
2. **Explain the mechanism:** Show the relevant code snippet from the existing codebase and annotate exactly where the logic diverges from the goal directives.
3. **Determine the root cause:** Classify the gap (e.g., architectural mismatch, schema update, missing logic).`;

const PHASE_2_ARCHITECT = `\
### Phase 2: Architect
Design a concrete, production-ready solution for each root cause.

For each solution, you must provide:
1. **Proposed Implementation:** Write the actual TypeScript/code demonstrating the solution. Include function signatures, interfaces, and logic.
2. **Integration Points:** Detail exactly where in the existing code this gets wired in, using before/after diffs to show the structural changes.
3. **Edge Cases:** Identify assumptions and define fallback behaviors.
4. **Test Scenarios:** Define specific test cases, inputs, and expected outputs that validate the fix.`;

const PHASE_3_PLAN = `\
### Phase 3: Plan (Coupling & Boundary Analysis)
Evaluate the exact file requirements for each architectural solution to define strict boundaries for the downstream worker agents.

1. **Coupling Analysis:** Map all implicitly coupled files. Identify test files that exercise the modified code, barrel exports (\`index.ts\`), and shared utilities.
2. **File Ownership & Locking:** The downstream Orchestrator prevents merge conflicts by locking files at runtime. You must exhaustively list every single file (source, test, and utility) the worker agent needs to touch.
3. **Task Sizing:** Keep tasks strictly isolated by functional domain. You may assign the same core file (e.g., \`types.ts\`) to multiple tasks; the Orchestrator will sequence them automatically based on your exhaustive file list.`;

const PHASE_4_DISPATCH_HEALTHY = `\
**Path A: System Healthy Protocol**
If your Phase 0 verification confirms that the codebase already satisfies the goal directives and no actionable work remains, formulate a comprehensive "Fleet Status: Goal Currently Satisfied" report. Detail exactly which domains, files, and logic paths you verified to reach this conclusion. Output this markdown report and exit gracefully, bypassing the issue creation step entirely. Preserve the repository's current state by creating issues only when substantial, goal-aligned engineering work is required.`;

const PHASE_4_DISPATCH_ISSUES = `\
**Path B: Task Dispatch Protocol**
For EACH validated task that requires execution, perform a **Deduplication Check** before creating an issue:

1. Compare your proposed task's scope against EVERY open issue in the Historical Context above.
2. If an existing open issue's **Objective** already covers the same gap (even partially or under a different name), **do NOT create a new issue**. Instead, note the overlap in your report and skip creation.
3. Only create an issue for gaps that are genuinely novel — not covered by any existing open issue.

For each non-duplicate task, create a signal using the \`jules-fleet signal create\` command.`;

const ISSUE_BODY_TEMPLATE = `\
\`\`\`markdown
### Objective
[2-3 sentences explaining the functional goal of this isolated task]

### Code-Level Diagnosis
**Code path:** [e.g., \`src/session.ts → fetch()\`]
**Mechanism:** [Explanation of the current state]
**Root cause:** [Summary of the architectural gap]

#### Current Implementation
\\\`\\\`\\\`typescript
// [Insert exact snippet from current codebase showing the logic to be changed]
\\\`\\\`\\\`

### Proposed Implementation
**Files to modify:** [Brief summary of structural changes]

#### Integration (Before → After)
\\\`\\\`\\\`diff
// [Insert precise diffs showing how the new logic integrates]
\\\`\\\`\\\`

### Test Scenarios
1. [Scenario 1: Input -> Expected Output]
2. [Scenario 2: Input -> Expected Output]

### Target Files
- [exact/path/to/source1.ts]
- [exact/path/to/source2.ts]
- [exact/path/to/test1.test.ts]

### Boundary Rules
Restrict your modifications exclusively to the files listed in the Target Files section. Ensure your source changes are entirely backward-compatible if unowned tests outside your boundary fail. Retain all existing file names and locations outside your explicitly declared target list.
\`\`\``;

// ── Prompt Builder ──────────────────────────────────────────────────

export function buildAnalyzerPrompt(options: AnalyzerPromptOptions): string {
  const {
    goalInstructions,
    openContext,
    closedContext,
    prContext,
    milestoneTitle,
  } = options;

  const prSection = prContext
    ? `\n**Recent Pull Requests (shows what code changes are in flight or merged):**\n${prContext}\n`
    : '';

  const milestoneFlag = milestoneTitle
    ? ` \\
  --scope "${milestoneTitle}"`
    : '';

  const cliFormat = `\
**Required signal creation format:**
\`\`\`bash
jules-fleet signal create \\
  --kind assessment \\
  --title "[Fleet Execution] <Highly Specific Domain Task Title>" \\
  --tag fleet \\
  --body-file <path_to_markdown_file>${milestoneFlag}
\`\`\``;

  return [
    SYSTEM_PREAMBLE,
    '',
    `## Your Goal & Directives`,
    goalInstructions,
    '',
    `---`,
    '',
    `## Historical Context (The Map)`,
    '',
    `The following are the **full details** of every issue in the milestone. Use these to understand the exact scope of existing and completed work. You MUST cross-reference your findings against these issues to avoid creating duplicates.`,
    '',
    DEDUP_RULES,
    '',
    `**Open Issues:**`,
    openContext,
    '',
    `**Recently Closed Issues (Last 14 Days — these are COMPLETED, do not recreate):**`,
    closedContext,
    prSection,
    `---`,
    '',
    `## Your Methodology`,
    '',
    `Perform a rigorous multi-phase analysis: **Verify**, **Investigate**, **Architect**, **Plan**, and **Dispatch**.`,
    '',
    PHASE_0_VERIFY,
    '',
    PHASE_1_INVESTIGATE,
    '',
    PHASE_2_ARCHITECT,
    '',
    PHASE_3_PLAN,
    '',
    `### Phase 4: Dispatch (Issue Creation or Goal Validation)`,
    `Translate your analysis into independent signals using \`jules-fleet signal create\`, or provide a clean bill of health.`,
    '',
    PHASE_4_DISPATCH_HEALTHY,
    '',
    PHASE_4_DISPATCH_ISSUES,
    '',
    cliFormat,
    '',
    `**Required Issue Body Format:**`,
    `The issue body MUST follow this exact markdown structure to ensure the worker agent and the Orchestrator function correctly:`,
    '',
    ISSUE_BODY_TEMPLATE,
  ].join('\n');
}
