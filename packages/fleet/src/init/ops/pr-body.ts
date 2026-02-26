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
 * Build the PR body for the fleet init PR.
 * Isolated so copy edits don't conflict with handler logic.
 */
export function buildInitPRBody(filesCreated: string[]): string {
  return [
    '## Fleet Initialization',
    '',
    'This PR adds the fleet workflow files for automated issue dispatch, merge, and analysis.',
    '',
    '### Files added',
    ...filesCreated.map((f) => `- \`${f}\``),
    '',
    '### Next steps',
    '1. Merge this PR',
    '2. Add `JULES_API_KEY` to your repo secrets',
    '3. Create milestones and issues with the `fleet` label',
    '4. Run `jules-fleet configure labels` to set up labels (or they were already created)',
  ].join('\n');
}
