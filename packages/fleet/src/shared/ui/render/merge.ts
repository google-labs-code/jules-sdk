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

import type { MergeEvent } from '../../events/merge.js';
import type { RenderContext } from '../spec.js';

/** Render a merge-domain event. */
export function renderMergeEvent(event: MergeEvent, ctx: RenderContext): void {
  switch (event.type) {
    case 'merge:start':
      ctx.info(
        `Merging ${event.prCount} PR(s) in ${event.owner}/${event.repo} [${event.mode}]`,
      );
      break;
    case 'merge:no-prs':
      ctx.info('No PRs ready to merge.');
      break;
    case 'merge:pr:processing':
      ctx.startSpinner(
        `PR #${event.number}: ${event.title}${event.retry ? ` (retry ${event.retry})` : ''}`,
      );
      break;
    case 'merge:branch:updating':
      ctx.startSpinner(`Updating branch for PR #${event.prNumber}…`);
      break;
    case 'merge:branch:updated':
      ctx.stopSpinner(`Branch updated for PR #${event.prNumber}`);
      break;
    case 'merge:ci:waiting':
      ctx.startSpinner(`Waiting for CI on PR #${event.prNumber}…`);
      break;
    case 'merge:ci:check': {
      const icon = event.status === 'pass' ? '✓' : event.status === 'fail' ? '✗' : '…';
      const dur = event.duration ? ` (${event.duration}s)` : '';
      ctx.info(`  ${icon} ${event.name}${dur}`);
      break;
    }
    case 'merge:ci:passed':
      ctx.stopSpinner(`CI passed for PR #${event.prNumber}`);
      break;
    case 'merge:ci:failed':
      ctx.stopSpinner(`CI failed for PR #${event.prNumber}`);
      break;
    case 'merge:ci:timeout':
      ctx.stopSpinner(`CI timed out for PR #${event.prNumber}`);
      break;
    case 'merge:ci:none':
      ctx.stopSpinner(`No CI checks for PR #${event.prNumber}`);
      break;
    case 'merge:pr:merging':
      ctx.startSpinner(`Merging PR #${event.prNumber}…`);
      break;
    case 'merge:pr:merged':
      ctx.stopSpinner(`PR #${event.prNumber} merged ✓`);
      break;
    case 'merge:pr:skipped':
      ctx.warn(`  ⊘ PR #${event.prNumber}: ${event.reason}`);
      break;
    case 'merge:conflict:detected':
      ctx.stopSpinner(`Conflict detected on PR #${event.prNumber}`);
      break;
    case 'merge:redispatch:start':
      ctx.startSpinner(`Re-dispatching PR #${event.oldPr}…`);
      break;
    case 'merge:redispatch:waiting':
      ctx.startSpinner(`Waiting for re-dispatched PR (was #${event.oldPr})…`);
      break;
    case 'merge:redispatch:done':
      ctx.stopSpinner(`Re-dispatched: #${event.oldPr} → #${event.newPr}`);
      break;
    case 'merge:done':
      ctx.success(
        `Merge complete — ${event.merged.length} merged, ${event.skipped.length} skipped`,
      );
      break;
  }
}
