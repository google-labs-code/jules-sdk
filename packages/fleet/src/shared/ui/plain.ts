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

import type { FleetEvent } from '../events.js';
import type { FleetRenderer } from './index.js';
import { sessionUrl } from './session-url.js';

/**
 * PlainRenderer uses console.log for CI-friendly plain text output.
 * Used when stdout is not a TTY (CI environments).
 */
export class PlainRenderer implements FleetRenderer {
  start(title: string): void {
    console.log(`\n═══ ${title} ═══\n`);
  }

  end(message: string): void {
    console.log(`\n═══ ${message} ═══\n`);
  }

  error(message: string): void {
    console.error(`ERROR: ${message}`);
  }

  render(event: FleetEvent): void {
    switch (event.type) {
      // ── Init events ──────────────────────────────────────────────
      case 'init:start':
        console.log(`Initializing fleet for ${event.owner}/${event.repo}`);
        break;
      case 'init:branch:creating':
        console.log(`Creating branch ${event.name} from ${event.base}…`);
        break;
      case 'init:branch:created':
        console.log(`  ✓ Branch ${event.name} created`);
        break;
      case 'init:file:committed':
        console.log(`  ✓ ${event.path}`);
        break;
      case 'init:file:skipped':
        console.log(`  ⊘ ${event.path} — ${event.reason}`);
        break;
      case 'init:pr:creating':
        console.log('Creating pull request…');
        break;
      case 'init:pr:created':
        console.log(`  ✓ PR #${event.number} created: ${event.url}`);
        break;
      case 'init:done':
        console.log(`Fleet initialized — PR: ${event.prUrl}`);
        break;

      // ── Configure events ─────────────────────────────────────────
      case 'configure:start':
        console.log(`Configuring ${event.resource} for ${event.owner}/${event.repo}`);
        break;
      case 'configure:label:created':
        console.log(`  ✓ Label "${event.name}" created`);
        break;
      case 'configure:label:exists':
        console.log(`  ⊘ Label "${event.name}" already exists`);
        break;
      case 'configure:secret:uploading':
        console.log(`Uploading secret ${event.name}…`);
        break;
      case 'configure:secret:uploaded':
        console.log(`  ✓ Secret ${event.name} uploaded`);
        break;
      case 'configure:done':
        console.log('Configuration complete');
        break;

      // ── Analyze events ───────────────────────────────────────────
      case 'analyze:start':
        console.log(`Analyzing ${event.goalCount} goal(s) for ${event.owner}/${event.repo}`);
        break;
      case 'analyze:goal:start':
        if (event.total > 1) {
          console.log(`[${event.index}/${event.total}] ${event.file}`);
        } else {
          console.log(event.file);
        }
        if (event.milestone) console.log(`  Milestone: ${event.milestone}`);
        break;
      case 'analyze:milestone:resolved':
        console.log(`  Milestone "${event.title}" (#${event.id})`);
        break;
      case 'analyze:context:fetched':
        console.log(
          `  Context: ${event.openIssues} open, ${event.closedIssues} closed, ${event.prs} PRs`,
        );
        break;
      case 'analyze:session:dispatching':
        console.log(`Dispatching session for ${event.goal}…`);
        break;
      case 'analyze:session:started':
        console.log(`  ✓ Session started: ${event.id}`);
        console.log(`    ${sessionUrl(event.id)}`);
        break;
      case 'analyze:session:failed':
        console.error(`  ✗ Failed: ${event.error}`);
        break;
      case 'analyze:done':
        console.log(
          `Analysis complete — ${event.sessionsStarted} session(s) from ${event.goalsProcessed} goal(s)`,
        );
        break;

      // ── Dispatch events ──────────────────────────────────────────
      case 'dispatch:start':
        console.log(`Dispatching from milestone ${event.milestone}`);
        break;
      case 'dispatch:scanning':
        console.log('Scanning for fleet issues…');
        break;
      case 'dispatch:found':
        console.log(`Found ${event.count} undispatched issue(s)`);
        break;
      case 'dispatch:issue:dispatching':
        console.log(`  Dispatching #${event.number}: ${event.title}`);
        break;
      case 'dispatch:issue:dispatched':
        console.log(`  ✓ #${event.number} → session ${event.sessionId}`);
        console.log(`    ${sessionUrl(event.sessionId)}`);
        break;
      case 'dispatch:issue:skipped':
        console.log(`  ⊘ #${event.number}: ${event.reason}`);
        break;
      case 'dispatch:done':
        console.log(
          `Dispatch complete — ${event.dispatched} dispatched, ${event.skipped} skipped`,
        );
        break;

      // ── Merge events ─────────────────────────────────────────────
      case 'merge:start':
        console.log(
          `Merging ${event.prCount} PR(s) in ${event.owner}/${event.repo} [${event.mode}]`,
        );
        break;
      case 'merge:no-prs':
        console.log('No PRs ready to merge.');
        break;
      case 'merge:pr:processing':
        console.log(
          `Processing PR #${event.number}: ${event.title}${event.retry ? ` (retry ${event.retry})` : ''}`,
        );
        break;
      case 'merge:branch:updating':
        console.log(`  Updating branch for PR #${event.prNumber}…`);
        break;
      case 'merge:branch:updated':
        console.log(`  ✓ Branch updated for PR #${event.prNumber}`);
        break;
      case 'merge:ci:waiting':
        console.log(`  Waiting for CI on PR #${event.prNumber}…`);
        break;
      case 'merge:ci:check': {
        const icon = event.status === 'pass' ? '✓' : event.status === 'fail' ? '✗' : '…';
        const dur = event.duration ? ` (${event.duration}s)` : '';
        console.log(`    ${icon} ${event.name}${dur}`);
        break;
      }
      case 'merge:ci:passed':
        console.log(`  ✓ CI passed for PR #${event.prNumber}`);
        break;
      case 'merge:ci:failed':
        console.log(`  ✗ CI failed for PR #${event.prNumber}`);
        break;
      case 'merge:ci:timeout':
        console.log(`  ⏱ CI timed out for PR #${event.prNumber}`);
        break;
      case 'merge:ci:none':
        console.log(`  — No CI checks for PR #${event.prNumber}`);
        break;
      case 'merge:pr:merging':
        console.log(`  Merging PR #${event.prNumber}…`);
        break;
      case 'merge:pr:merged':
        console.log(`  ✓ PR #${event.prNumber} merged`);
        break;
      case 'merge:pr:skipped':
        console.log(`  ⊘ PR #${event.prNumber}: ${event.reason}`);
        break;
      case 'merge:conflict:detected':
        console.log(`  ⚠ Conflict detected on PR #${event.prNumber}`);
        break;
      case 'merge:redispatch:start':
        console.log(`  Re-dispatching PR #${event.oldPr}…`);
        break;
      case 'merge:redispatch:waiting':
        console.log(`  Waiting for re-dispatched PR (was #${event.oldPr})…`);
        break;
      case 'merge:redispatch:done':
        console.log(`  ✓ Re-dispatched: #${event.oldPr} → #${event.newPr}`);
        break;
      case 'merge:done':
        console.log(
          `Merge complete — ${event.merged.length} merged, ${event.skipped.length} skipped`,
        );
        break;

      // ── Error ────────────────────────────────────────────────────
      case 'error':
        console.error(`ERROR [${event.code}]: ${event.message}`);
        if (event.suggestion) console.log(`  💡 ${event.suggestion}`);
        break;
    }
  }
}
