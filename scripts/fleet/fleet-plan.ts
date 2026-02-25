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

import { jules } from '@google/jules-sdk';
import { analyzeIssuesPrompt } from './prompts/analyze-issues.js';
import { getIssuesAsMarkdown } from './github/markdown.js';
import { getGitRepoInfo, getCurrentBranch } from './github/git.js';

const repoInfo = await getGitRepoInfo();
const baseBranch = process.env.FLEET_BASE_BRANCH ?? (await getCurrentBranch());
const issuesMarkdown = await getIssuesAsMarkdown();
const prompt = analyzeIssuesPrompt({
  issuesMarkdown,
  repoFullName: repoInfo.fullName,
});

console.log(
  `🔍 Planning fleet for ${repoInfo.fullName} (branch: ${baseBranch})`,
);

const session = await jules.session({
  prompt,
  source: {
    github: repoInfo.fullName,
    baseBranch,
  },
  autoPr: true,
});

console.log(`✅ Planner session started: ${session.id}`);
