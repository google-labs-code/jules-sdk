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

import * as p from '@clack/prompts';
import type { FleetEvent } from '../events.js';
import type { FleetRenderer } from './index.js';
import { sessionUrl } from './session-url.js';

/**
 * InteractiveRenderer uses @clack/prompts for rich TUI output.
 * Used when stdout is a TTY (local development).
 */
export class InteractiveRenderer implements FleetRenderer {
  private spinner: ReturnType<typeof p.spinner> | null = null;

  start(title: string): void {
    p.intro(title);
  }

  end(message: string): void {
    this.stopSpinner();
    p.outro(message);
  }

  error(message: string): void {
    this.stopSpinner();
    p.log.error(message);
  }

  render(event: FleetEvent): void {
    switch (event.type) {
      // ── Init events ──────────────────────────────────────────────
      case 'init:start':
        p.log.info(`Initializing fleet for ${event.owner}/${event.repo}`);
        break;
      case 'init:branch:creating':
        this.startSpinner(`Creating branch ${event.name} from ${event.base}`);
        break;
      case 'init:branch:created':
        this.stopSpinner(`Branch ${event.name} created`);
        break;
      case 'init:file:committed':
        p.log.info(`  ✓ ${event.path}`);
        break;
      case 'init:file:skipped':
        p.log.warn(`  ⊘ ${event.path} — ${event.reason}`);
        break;
      case 'init:pr:creating':
        this.startSpinner('Creating pull request…');
        break;
      case 'init:pr:created':
        this.stopSpinner(`PR #${event.number} created`);
        p.log.info(`  ${event.url}`);
        break;
      case 'init:done':
        p.log.success(`Fleet initialized — PR: ${event.prUrl}`);
        break;

      // ── Configure events ─────────────────────────────────────────
      case 'configure:start':
        p.log.info(`Configuring ${event.resource} for ${event.owner}/${event.repo}`);
        break;
      case 'configure:label:created':
        p.log.info(`  ✓ Label "${event.name}" created`);
        break;
      case 'configure:label:exists':
        p.log.warn(`  ⊘ Label "${event.name}" already exists`);
        break;
      case 'configure:secret:uploading':
        this.startSpinner(`Uploading secret ${event.name}…`);
        break;
      case 'configure:secret:uploaded':
        this.stopSpinner(`Secret ${event.name} uploaded`);
        break;
      case 'configure:done':
        p.log.success('Configuration complete');
        break;

      // ── Analyze events ───────────────────────────────────────────
      case 'analyze:start':
        p.log.info(`Analyzing ${event.goalCount} goal(s) for ${event.owner}/${event.repo}`);
        break;
      case 'analyze:goal:start':
        if (event.total > 1) {
          p.log.step(`[${event.index}/${event.total}] ${event.file}`);
        } else {
          p.log.step(event.file);
        }
        if (event.milestone) p.log.info(`  Milestone: ${event.milestone}`);
        break;
      case 'analyze:milestone:resolved':
        p.log.info(`  Milestone "${event.title}" (#${event.id})`);
        break;
      case 'analyze:context:fetched':
        p.log.info(
          `  Context: ${event.openIssues} open, ${event.closedIssues} closed, ${event.prs} PRs`,
        );
        break;
      case 'analyze:session:dispatching':
        this.startSpinner(`Dispatching session for ${event.goal}…`);
        break;
      case 'analyze:session:started':
        this.stopSpinner(`Session started: ${event.id}`);
        p.log.info(`  ${sessionUrl(event.id)}`);
        break;
      case 'analyze:session:failed':
        this.stopSpinner();
        p.log.error(`  Failed: ${event.error}`);
        break;
      case 'analyze:done':
        p.log.success(
          `Analysis complete — ${event.sessionsStarted} session(s) from ${event.goalsProcessed} goal(s)`,
        );
        break;

      // ── Dispatch events ──────────────────────────────────────────
      case 'dispatch:start':
        p.log.info(`Dispatching from milestone ${event.milestone}`);
        break;
      case 'dispatch:scanning':
        this.startSpinner('Scanning for fleet issues…');
        break;
      case 'dispatch:found':
        this.stopSpinner(`Found ${event.count} undispatched issue(s)`);
        break;
      case 'dispatch:issue:dispatching':
        this.startSpinner(`#${event.number}: ${event.title}`);
        break;
      case 'dispatch:issue:dispatched':
        this.stopSpinner(`#${event.number} → session ${event.sessionId}`);
        p.log.info(`  ${sessionUrl(event.sessionId)}`);
        break;
      case 'dispatch:issue:skipped':
        p.log.warn(`  ⊘ #${event.number}: ${event.reason}`);
        break;
      case 'dispatch:done':
        p.log.success(
          `Dispatch complete — ${event.dispatched} dispatched, ${event.skipped} skipped`,
        );
        break;

      // ── Merge events ─────────────────────────────────────────────
      case 'merge:start':
        p.log.info(
          `Merging ${event.prCount} PR(s) in ${event.owner}/${event.repo} [${event.mode}]`,
        );
        break;
      case 'merge:no-prs':
        p.log.info('No PRs ready to merge.');
        break;
      case 'merge:pr:processing':
        this.startSpinner(
          `PR #${event.number}: ${event.title}${event.retry ? ` (retry ${event.retry})` : ''}`,
        );
        break;
      case 'merge:branch:updating':
        this.startSpinner(`Updating branch for PR #${event.prNumber}…`);
        break;
      case 'merge:branch:updated':
        this.stopSpinner(`Branch updated for PR #${event.prNumber}`);
        break;
      case 'merge:ci:waiting':
        this.startSpinner(`Waiting for CI on PR #${event.prNumber}…`);
        break;
      case 'merge:ci:check': {
        const icon = event.status === 'pass' ? '✓' : event.status === 'fail' ? '✗' : '…';
        const dur = event.duration ? ` (${event.duration}s)` : '';
        p.log.info(`  ${icon} ${event.name}${dur}`);
        break;
      }
      case 'merge:ci:passed':
        this.stopSpinner(`CI passed for PR #${event.prNumber}`);
        break;
      case 'merge:ci:failed':
        this.stopSpinner(`CI failed for PR #${event.prNumber}`);
        break;
      case 'merge:ci:timeout':
        this.stopSpinner(`CI timed out for PR #${event.prNumber}`);
        break;
      case 'merge:ci:none':
        this.stopSpinner(`No CI checks for PR #${event.prNumber}`);
        break;
      case 'merge:pr:merging':
        this.startSpinner(`Merging PR #${event.prNumber}…`);
        break;
      case 'merge:pr:merged':
        this.stopSpinner(`PR #${event.prNumber} merged ✓`);
        break;
      case 'merge:pr:skipped':
        p.log.warn(`  ⊘ PR #${event.prNumber}: ${event.reason}`);
        break;
      case 'merge:conflict:detected':
        this.stopSpinner(`Conflict detected on PR #${event.prNumber}`);
        break;
      case 'merge:redispatch:start':
        this.startSpinner(`Re-dispatching PR #${event.oldPr}…`);
        break;
      case 'merge:redispatch:waiting':
        this.startSpinner(`Waiting for re-dispatched PR (was #${event.oldPr})…`);
        break;
      case 'merge:redispatch:done':
        this.stopSpinner(`Re-dispatched: #${event.oldPr} → #${event.newPr}`);
        break;
      case 'merge:done':
        p.log.success(
          `Merge complete — ${event.merged.length} merged, ${event.skipped.length} skipped`,
        );
        break;

      // ── Error ────────────────────────────────────────────────────
      case 'error':
        this.stopSpinner();
        p.log.error(`[${event.code}] ${event.message}`);
        if (event.suggestion) p.log.info(`  💡 ${event.suggestion}`);
        break;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────
  private startSpinner(message: string): void {
    this.stopSpinner();
    this.spinner = p.spinner();
    this.spinner.start(message);
  }

  private stopSpinner(message?: string): void {
    if (this.spinner) {
      this.spinner.stop(message);
      this.spinner = null;
    }
  }
}
