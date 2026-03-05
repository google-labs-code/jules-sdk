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

import type { Octokit } from 'octokit';
import type { AuditInput } from '../spec.js';
import type { AuditFinding } from '../findings.js';
import { parseNodeId } from '../findings.js';
import { addLabel } from '../ops/add-label.js';
import { assignMilestone } from '../ops/assign-milestone.js';

/**
 * Step 4: Handle fix mode (off / dry-run / apply).
 *
 * - off: no-op, returns 0
 * - dry-run: marks deterministic findings with wouldFix, returns 0
 * - apply: calls APIs to fix deterministic findings, returns fixed count
 */
export async function applyFixMode(
  octokit: Octokit,
  input: AuditInput,
  findings: AuditFinding[],
): Promise<number> {
  if (input.fixMode === 'dry-run') {
    for (const finding of findings) {
      if (finding.fixability === 'deterministic' && !finding.fixed) {
        finding.wouldFix = true;
      }
    }
    return 0;
  }

  if (input.fixMode === 'apply') {
    return applyFixes(octokit, input, findings);
  }

  return 0;
}

// ── APPLY FIXES ────────────────────────────────────────────────────

async function applyFixes(
  octokit: Octokit,
  input: AuditInput,
  findings: AuditFinding[],
): Promise<number> {
  let fixedCount = 0;

  for (const finding of findings) {
    if (finding.fixability !== 'deterministic' || finding.fixed) continue;

    try {
      switch (finding.type) {
        case 'pr:missing-label': {
          const parsed = parseNodeId(finding.nodeId);
          if (!parsed) break;
          await addLabel(
            octokit,
            input.owner,
            input.repo,
            Number(parsed.id),
            'fleet-merge-ready',
          );
          finding.fixed = true;
          fixedCount++;
          break;
        }
        // Other deterministic fixes can be added here
        default:
          break;
      }
    } catch {
      // Log but continue — one fix failure shouldn't stop others
    }
  }

  return fixedCount;
}
