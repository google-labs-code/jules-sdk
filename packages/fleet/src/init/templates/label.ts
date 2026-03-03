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

import type { WorkflowTemplate } from './types.js';

const TEMPLATE_NAME = 'fleet-label.yml';

export const FLEET_LABEL_TEMPLATE: WorkflowTemplate = {
  repoPath: `.github/workflows/${TEMPLATE_NAME}`,
  content: `name: Fleet Label PR
on:
  pull_request:
    types: [opened]

permissions:
  pull-requests: write
  issues: read

jobs:
  label_pr:
    runs-on: ubuntu-latest
    steps:
      - name: Check linked issue and apply label/milestone
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          PR_URL: \${{ github.event.pull_request.html_url }}
          REPO: \${{ github.repository }}
        run: |
          # Use GitHub's own closing keyword resolution to find linked issues
          ISSUE_NUMBER=$(gh pr view "$PR_URL" --json closingIssuesReferences --jq '.closingIssuesReferences[0].number // empty')

          if [ -z "$ISSUE_NUMBER" ]; then
            echo "No closing issue reference found on this PR. Exiting."
            exit 0
          fi

          echo "Found linked issue: #$ISSUE_NUMBER"

          # Check if the linked issue has the 'fleet' label
          HAS_FLEET=$(gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json labels --jq '[.labels[].name] | any(. == "fleet")')

          if [ "$HAS_FLEET" = "true" ]; then
            echo "Linked issue has 'fleet' label. Applying 'fleet-merge-ready' to PR."
            gh pr edit "$PR_URL" --add-label "fleet-merge-ready"

            # Check if linked issue has a milestone and copy it
            MILESTONE_TITLE=$(gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json milestone --jq '.milestone.title // empty')
            if [ -n "$MILESTONE_TITLE" ]; then
              echo "Applying milestone '$MILESTONE_TITLE' to PR."
              gh pr edit "$PR_URL" --milestone "$MILESTONE_TITLE"
            fi
          else
            echo "Linked issue does not have 'fleet' label. Ignoring."
          fi
`,
};
