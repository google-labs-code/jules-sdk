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
  /** Repo-wide preamble from .fleet/config.yml, prepended to goal body */
  preamble?: string;
}

// ── Prompt Constants ────────────────────────────────────────────────

const SYSTEM_PREAMBLE = `\
You are a senior software architect performing a rigorous code analysis. Your ONLY deliverable is GitHub issues created via the \`npx @google/jules-fleet signal create\` CLI command.

Focus exclusively on analysis and signal creation. Leave all application code, project scaffolding, and feature implementation to the downstream worker agents who will receive your signals. Your value is in the precision of your diagnosis and the clarity of your issue descriptions — the code comes later, from others.`;

const DEDUP_RULES = `\
**Deduplication Rules (MANDATORY):**
1. **Closed Issue = Work Already Done.** Do NOT recreate issues that have been closed.
2. **Open Issue = Work In Progress.** Someone is already handling it. Do NOT create a duplicate.
3. **PR with "Fixes #N" = Issue Being Resolved.** If a PR references an issue, that issue is handled. Do NOT create a new issue for the same thing.
4. **When in doubt, skip it.** It is better to miss a real gap than to create a duplicate that wastes engineering time.`;

const PHASE_0_VERIFY_CORE = `\
### Phase 0: Reality Verification
Before planning new tasks, verify the current state of the repository against your goal directives.

The full details of every open and recently closed issue are provided above in "Historical Context (The Map)". Read each issue's **Objective** and **Proposed Implementation** sections carefully to understand what work is already planned or completed.

Then, inspect the actual source files to confirm whether the required changes or architectural gaps currently exist. Cross-reference your findings with both the Open and Recently Closed Issues to ensure the work has not already been completed or is not already tracked.

Proceed to Phase 1 exclusively for gaps that are:
1. Demonstrably present in the live codebase today, AND
2. Not already covered by an existing open issue's Objective.`;

/** Addon: Diagnostics execution — separate so edits don't conflict with Phase 0 core */
const PHASE_0_DIAGNOSTICS = `\
**Diagnostics:** If the goal includes a \`## Diagnostics\` section, execute each command now and include the output in your Phase 0 findings. Build failures, type errors, and audit warnings are objective evidence — they are findings themselves. Diagnose the root cause of any failure before proceeding.`;

/** Composed Phase 0 — core + diagnostics addon */
const PHASE_0_VERIFY = [PHASE_0_VERIFY_CORE.split('\n').slice(0, 2).join('\n'), '', PHASE_0_DIAGNOSTICS, '', PHASE_0_VERIFY_CORE.split('\n').slice(3).join('\n')].join('\n');

const PHASE_1_INVESTIGATE_CORE = `\
### Phase 1: Investigate
Trace identified gaps directly to their source in the codebase. Produce a code-level diagnosis.

For every identified issue, you must:
1. **Identify the exact code path:** Map the execution flow referencing specific files, functions, and line ranges.
2. **Explain the mechanism:** Show the relevant code snippet from the existing codebase and annotate exactly where the logic diverges from the goal directives.
3. **Determine the root cause:** Classify the gap (e.g., architectural mismatch, schema update, missing logic).`;

/** Addon: Tools execution — separate so edits don't conflict with Phase 1 core */
const PHASE_1_TOOLS = `\
**Evidence Gathering:** If the goal includes a \`## Tools\` section, use these commands to gather evidence for specific findings. Run them selectively — only when a finding warrants deeper investigation. For example, run coverage analysis only for modules where you suspect gaps, not across the entire codebase.`;

/** Composed Phase 1 — core header + tools addon + core body */
const PHASE_1_INVESTIGATE = [PHASE_1_INVESTIGATE_CORE.split('\n').slice(0, 2).join('\n'), '', PHASE_1_TOOLS, '', PHASE_1_INVESTIGATE_CORE.split('\n').slice(3).join('\n')].join('\n');

const PHASE_2_ARCHITECT = `\
### Phase 2: Architect
Design a concrete, production-ready solution for each root cause.

For each solution, you must provide:
1. **Proposed Implementation:** Write code demonstrating the solution in the project's primary language. Include function signatures, types, and logic.
2. **Integration Points:** Detail exactly where in the existing code this gets wired in, using before/after diffs to show the structural changes.
3. **Edge Cases:** Identify assumptions and define fallback behaviors.
4. **Test Scenarios:** Define specific test cases, inputs, and expected outputs that validate the fix.`;

const PHASE_3_PLAN = `\
### Phase 3: Plan (Coupling & Boundary Analysis)
Evaluate the exact file requirements for each architectural solution to define strict boundaries for the downstream worker agents.

1. **Coupling Analysis:** Map all implicitly coupled files. Identify test files that exercise the modified code, barrel exports, and shared utilities.
2. **File Ownership &#x26; Locking:** The downstream Orchestrator prevents merge conflicts by locking files at runtime. You must exhaustively list every single file (source, test, and utility) the worker agent needs to touch.
3. **Task Sizing:** Keep tasks strictly isolated by functional domain. You may assign the same core file (e.g., shared type definitions) to multiple tasks; the Orchestrator will sequence them automatically based on your exhaustive file list.`;

const PHASE_4_DISPATCH_HEALTHY = `\
**Path A: System Healthy Protocol**
If your Phase 0 verification confirms that the codebase already satisfies the goal directives and no actionable work remains, formulate a comprehensive "Fleet Status: Goal Currently Satisfied" report. Detail exactly which domains, files, and logic paths you verified to reach this conclusion. Output this markdown report and exit gracefully, bypassing the issue creation step entirely. Preserve the repository's current state by creating issues only when substantial, goal-aligned engineering work is required.`;

const PHASE_4_DISPATCH_ISSUES = `\
**Path B: Task Dispatch Protocol**
For EACH validated task that requires execution, perform a **Deduplication Check** before creating an issue:

1. Compare your proposed task's scope against EVERY open issue in the Historical Context above.
2. If an existing open issue's **Objective** already covers the same gap (even partially or under a different name), **do NOT create a new issue**. Instead, note the overlap in your report and skip creation.
3. Only create an issue for gaps that are genuinely novel — not covered by any existing open issue.

For each non-duplicate task, create a signal using the \`npx @google/jules-fleet signal create\` command.`;

const ISSUE_BODY_TEMPLATE = `\
\`\`\`markdown
### Objective
[2-3 sentences explaining the functional goal of this isolated task]

### Code-Level Diagnosis
**Code path:** [e.g., src/module.py -> function_name()]
**Mechanism:** [Explanation of the current state]
**Root cause:** [Summary of the architectural gap]

#### Current Implementation
\`\`\`
// [Insert exact snippet from current codebase showing the logic to be changed]
\`\`\`

### Proposed Implementation
**Files to modify:** [Brief summary of structural changes]

#### Integration (Before -> After)
\`\`\`diff
// [Insert precise diffs showing how the new logic integrates]
\`\`\`

### Test Scenarios
1. [Scenario 1: Input -> Expected Output]
2. [Scenario 2: Input -> Expected Output]

### Target Files
- [exact/path/to/source_file]
- [exact/path/to/test_file]

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
    preamble,
  } = options;

  // Prepend repo-wide preamble to goal instructions if provided
  const fullGoalInstructions = preamble
    ? `${preamble}\n\n${goalInstructions}`
    : goalInstructions;

  const prSection = prContext
    ? `\n**Recent Pull Requests (shows what code changes are in flight or merged):**\n${prContext}\n`
    : '';

  const milestoneFlag = milestoneTitle
    ? ` \\
  --scope "${milestoneTitle}"`
    : '';

  const cliFormat = `\
**Signal creation formats:**

**Assessment** (actionable — requires code changes):
\`\`\`bash
npx @google/jules-fleet signal create \\\
  --kind assessment \\\
  --title "[Fleet Execution] [Highly Specific Domain Task Title]" \\\
  --tag fleet \\\
  --body-file [path_to_markdown_file]${milestoneFlag}
\`\`\`

**Insight** (informational — no action required):
\`\`\`bash
npx @google/jules-fleet signal create \\\
  --kind insight \\\
  --title "[Descriptive Finding]" \\\
  --tag fleet \\\
  --body-file [path_to_markdown_file]${milestoneFlag}
\`\`\``;

  return [
    SYSTEM_PREAMBLE,
    '',
    `## Your Goal & Directives`,
    fullGoalInstructions,
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
    `Translate your analysis into independent signals using \`npx @google/jules-fleet signal create\`, or provide a clean bill of health.`,
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
