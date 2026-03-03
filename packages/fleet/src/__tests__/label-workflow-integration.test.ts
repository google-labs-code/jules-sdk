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
 * Integration tests for the label workflow shell script.
 *
 * These extract the actual bash script from the YAML template,
 * run it with a mock `gh` CLI, and verify the correct `gh` commands
 * are invoked for labeling and milestone assignment.
 *
 * This is a REAL integration test — it runs the actual bash logic
 * against a mock `gh` binary. No string matching, no Docker.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as yaml from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { FLEET_LABEL_TEMPLATE } from '../init/templates/label.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Parse the YAML template and extract the `run:` block */
function extractRunScript(): string {
  const parsed = yaml.parse(FLEET_LABEL_TEMPLATE.content);
  const steps = parsed.jobs.label_pr.steps;
  const runStep = steps.find((s: { run?: string }) => s.run);
  if (!runStep?.run) throw new Error('No run step found in label template');
  return runStep.run;
}

interface MockGhConfig {
  /** JSON to return for `gh pr view` (closingIssuesReferences) */
  prViewResponse: object;
  /** JSON to return for `gh issue view --json labels` */
  issueLabelsResponse: object;
  /** JSON to return for `gh issue view --json milestone` */
  issueMilestoneResponse: object;
}

/**
 * Creates a temp directory with:
 *   - A mock `gh` script that logs calls and returns configured responses
 *   - The extracted label script ready to run
 *
 * Returns { dir, callLog } where callLog is the path to the gh call log.
 */
function setupTestEnvironment(config: MockGhConfig): {
  dir: string;
  callLogPath: string;
  scriptPath: string;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-label-test-'));
  const callLogPath = path.join(dir, 'gh-calls.log');
  const scriptPath = path.join(dir, 'label-script.sh');

  // Write the mock gh CLI
  const mockGhPath = path.join(dir, 'gh');
  // Store JSON responses as files so we don't have to worry about shell quoting
  const prViewPath = path.join(dir, 'pr-view-response.json');
  const issueLabelsPath = path.join(dir, 'issue-labels-response.json');
  const issueMilestonePath = path.join(dir, 'issue-milestone-response.json');

  fs.writeFileSync(prViewPath, JSON.stringify(config.prViewResponse));
  fs.writeFileSync(issueLabelsPath, JSON.stringify(config.issueLabelsResponse));
  fs.writeFileSync(issueMilestonePath, JSON.stringify(config.issueMilestoneResponse));

  const mockGhScript = `#!/bin/bash
# Log every invocation
echo "$@" >> "${callLogPath}"

# Find the --jq value from arguments
JQ_EXPR=""
ARGS=("$@")
for ((i=0; i<\${#ARGS[@]}; i++)); do
  if [ "\${ARGS[$i]}" = "--jq" ]; then
    JQ_EXPR="\${ARGS[$((i+1))]}"
  fi
done

# Route based on command pattern and apply jq if present
JSON_FILE=""
case "$*" in
  *"pr view"*"closingIssuesReferences"*)
    JSON_FILE="${prViewPath}"
    ;;
  *"issue view"*"labels"*)
    JSON_FILE="${issueLabelsPath}"
    ;;
  *"issue view"*"milestone"*)
    JSON_FILE="${issueMilestonePath}"
    ;;
  *"pr edit"*)
    # Just log it, return success
    exit 0
    ;;
  *)
    echo "mock-gh: unhandled command: $*" >&2
    exit 1
    ;;
esac

if [ -n "$JQ_EXPR" ] && [ -n "$JSON_FILE" ]; then
  jq -r "$JQ_EXPR" "$JSON_FILE"
elif [ -n "$JSON_FILE" ]; then
  cat "$JSON_FILE"
fi
`;
  fs.writeFileSync(mockGhPath, mockGhScript, { mode: 0o755 });

  // Write the actual label script extracted from the template
  const script = extractRunScript();
  fs.writeFileSync(scriptPath, `#!/bin/bash\nset -e\n${script}`, { mode: 0o755 });

  return { dir, callLogPath, scriptPath };
}

/** Run the label script with the mock gh on PATH */
function runScript(
  scriptPath: string,
  mockDir: string,
  env: Record<string, string>,
): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`bash ${scriptPath}`, {
      env: {
        PATH: `${mockDir}:${process.env.PATH}`,
        HOME: process.env.HOME ?? '',
        ...env,
      },
      encoding: 'utf-8',
      timeout: 5000,
    });
    return { stdout, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout ?? '',
      exitCode: error.status ?? 1,
    };
  }
}

/** Read the gh call log and return each line as an array */
function readCallLog(callLogPath: string): string[] {
  if (!fs.existsSync(callLogPath)) return [];
  return fs.readFileSync(callLogPath, 'utf-8').trim().split('\n').filter(Boolean);
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Label workflow shell integration', () => {
  let testDir: string;

  afterEach(() => {
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('applies fleet-merge-ready label when issue has fleet label', () => {
    const { dir, callLogPath, scriptPath } = setupTestEnvironment({
      prViewResponse: {
        closingIssuesReferences: [{ number: 42 }],
      },
      issueLabelsResponse: {
        labels: [{ name: 'fleet' }, { name: 'bug' }],
      },
      issueMilestoneResponse: {
        milestone: null,
      },
    });
    testDir = dir;

    const { stdout, exitCode } = runScript(scriptPath, dir, {
      GH_TOKEN: 'mock-token',
      PR_URL: 'https://github.com/owner/repo/pull/99',
      REPO: 'owner/repo',
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Found linked issue: #42');
    expect(stdout).toContain('fleet-merge-ready');

    const calls = readCallLog(callLogPath);
    // Should have called: pr view, issue view (labels), pr edit (add-label), issue view (milestone)
    const editCall = calls.find((c) => c.includes('pr edit'));
    expect(editCall).toBeDefined();
    expect(editCall).toContain('--add-label');
    expect(editCall).toContain('fleet-merge-ready');
  });

  it('copies milestone from issue to PR', () => {
    const { dir, callLogPath, scriptPath } = setupTestEnvironment({
      prViewResponse: {
        closingIssuesReferences: [{ number: 42 }],
      },
      issueLabelsResponse: {
        labels: [{ name: 'fleet' }],
      },
      issueMilestoneResponse: {
        milestone: { title: 'v1.0' },
      },
    });
    testDir = dir;

    const { stdout, exitCode } = runScript(scriptPath, dir, {
      GH_TOKEN: 'mock-token',
      PR_URL: 'https://github.com/owner/repo/pull/99',
      REPO: 'owner/repo',
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Applying milestone 'v1.0' to PR.");

    const calls = readCallLog(callLogPath);
    const milestoneCall = calls.find((c) => c.includes('--milestone'));
    expect(milestoneCall).toBeDefined();
    expect(milestoneCall).toContain('v1.0');
  });

  it('does nothing when issue lacks fleet label', () => {
    const { dir, callLogPath, scriptPath } = setupTestEnvironment({
      prViewResponse: {
        closingIssuesReferences: [{ number: 42 }],
      },
      issueLabelsResponse: {
        labels: [{ name: 'bug' }, { name: 'enhancement' }],
      },
      issueMilestoneResponse: {
        milestone: null,
      },
    });
    testDir = dir;

    const { stdout, exitCode } = runScript(scriptPath, dir, {
      GH_TOKEN: 'mock-token',
      PR_URL: 'https://github.com/owner/repo/pull/99',
      REPO: 'owner/repo',
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('does not have');

    const calls = readCallLog(callLogPath);
    const editCalls = calls.filter((c) => c.includes('pr edit'));
    expect(editCalls).toHaveLength(0);
  });

  it('exits gracefully when PR has no linked issue', () => {
    const { dir, callLogPath, scriptPath } = setupTestEnvironment({
      prViewResponse: {
        closingIssuesReferences: [],
      },
      issueLabelsResponse: { labels: [] },
      issueMilestoneResponse: { milestone: null },
    });
    testDir = dir;

    const { stdout, exitCode } = runScript(scriptPath, dir, {
      GH_TOKEN: 'mock-token',
      PR_URL: 'https://github.com/owner/repo/pull/99',
      REPO: 'owner/repo',
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('No closing issue reference');

    const calls = readCallLog(callLogPath);
    // Only the pr view call should have been made
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('pr view');
  });

  it('applies label but skips milestone when issue has no milestone', () => {
    const { dir, callLogPath, scriptPath } = setupTestEnvironment({
      prViewResponse: {
        closingIssuesReferences: [{ number: 42 }],
      },
      issueLabelsResponse: {
        labels: [{ name: 'fleet' }],
      },
      issueMilestoneResponse: {
        milestone: null,
      },
    });
    testDir = dir;

    const { stdout, exitCode } = runScript(scriptPath, dir, {
      GH_TOKEN: 'mock-token',
      PR_URL: 'https://github.com/owner/repo/pull/99',
      REPO: 'owner/repo',
    });

    expect(exitCode).toBe(0);

    const calls = readCallLog(callLogPath);
    // Should add label but NOT set milestone
    const labelCall = calls.find((c) => c.includes('--add-label'));
    expect(labelCall).toBeDefined();

    const milestoneCall = calls.find((c) => c.includes('--milestone'));
    expect(milestoneCall).toBeUndefined();
  });

  it('passes --repo flag for all gh issue commands', () => {
    const { dir, callLogPath, scriptPath } = setupTestEnvironment({
      prViewResponse: {
        closingIssuesReferences: [{ number: 42 }],
      },
      issueLabelsResponse: {
        labels: [{ name: 'fleet' }],
      },
      issueMilestoneResponse: {
        milestone: { title: 'v2.0' },
      },
    });
    testDir = dir;

    runScript(scriptPath, dir, {
      GH_TOKEN: 'mock-token',
      PR_URL: 'https://github.com/owner/repo/pull/99',
      REPO: 'owner/repo',
    });

    const calls = readCallLog(callLogPath);
    const issueCalls = calls.filter((c) => c.includes('issue view'));
    expect(issueCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of issueCalls) {
      expect(call).toContain('--repo');
      expect(call).toContain('owner/repo');
    }
  });
});
