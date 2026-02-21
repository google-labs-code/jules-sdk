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
import { analyzeIssuesPrompt } from "./analyze-issues.js";
import { getGitRepoInfo } from "../github/git.js";

/**
 * Static bootstrap prompt for scheduled Jules sessions.
 *
 * Since the Jules scheduled session receives a fixed prompt (issues aren't
 * known at scheduling time), this prompt instructs Jules to:
 * 1. Run `bun run scripts/fleet/fleet-analyze.ts` to fetch current open issues
 * 2. Use the output as input for the analyze-issues prompt
 * 3. Run the dispatcher to dispatch sub-tasks
 *
 * Usage: Pass this prompt's output as the `prompt` field when creating
 * a scheduled Jules session.
 */
export async function bootstrapPrompt(): Promise<string> {
  const repoInfo = await getGitRepoInfo();

  // We generate the analysis prompt template with a placeholder.
  // Jules will replace it with the actual issues at runtime.
  const analysisPrompt = analyzeIssuesPrompt({
    issuesMarkdown: "{{ISSUES_MARKDOWN}}",
    repoFullName: repoInfo.fullName,
  });

  return `You are the fleet planner for ${repoInfo.fullName}. Your job is to fetch open GitHub issues, analyze them, and dispatch parallel coding agents.

## Step 1: Fetch open issues

Run this command to get the current open issues as markdown:

\`\`\`bash
bun run scripts/fleet/fleet-analyze.ts
\`\`\`

Capture the entire output. This is the issues document you will analyze.

## Step 2: Analyze issues and produce tasks

Using the issues output from Step 1, perform the full analysis described below. Everywhere you see \`{{ISSUES_MARKDOWN}}\` in the analysis prompt, substitute the output from Step 1.

---

${analysisPrompt}

---

## Step 3: Dispatch

After writing both \`.fleet/\` files, run the dispatcher:

\`\`\`bash
bun run scripts/fleet/fleet-dispatch.ts
\`\`\`

This dispatches parallel Jules sessions for each task and logs session IDs to \`.fleet/{date}/sessions.json\`.

**Do not skip any step. The analysis is only complete once sub-tasks have been dispatched.**`;
}
