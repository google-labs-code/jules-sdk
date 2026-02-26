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
 * Example goal file content committed by `jules-fleet init`.
 * Lives in its own file to keep handler.ts focused on orchestration.
 */
export const EXAMPLE_GOAL = `\
---
milestone: "1"
---

# Example Fleet Goal

Analyze the codebase for potential improvements and create issues for the engineering team.

## Focus Areas
- Code quality improvements
- Missing test coverage
- Documentation gaps
- Performance optimizations

## Rules
- Do NOT propose changes already covered by open issues
- Do NOT propose changes rejected in recently closed issues
- Each insight should be actionable and specific
`;
