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

import type { AnalyzeEvent } from '../../events/analyze.js';
import type { RenderContext } from '../spec.js';
import { sessionUrl } from '../session-url.js';

/** Render an analyze-domain event. */
export function renderAnalyzeEvent(event: AnalyzeEvent, ctx: RenderContext): void {
  switch (event.type) {
    case 'analyze:start':
      ctx.info(`Analyzing ${event.goalCount} goal(s) for ${event.owner}/${event.repo}`);
      break;
    case 'analyze:goal:start':
      if (event.total > 1) {
        ctx.step(`[${event.index}/${event.total}] ${event.file}`);
      } else {
        ctx.step(event.file);
      }
      if (event.milestone) ctx.info(`  Milestone: ${event.milestone}`);
      break;
    case 'analyze:milestone:resolved':
      ctx.info(`  Milestone "${event.title}" (#${event.id})`);
      break;
    case 'analyze:context:fetched':
      ctx.info(
        `  Context: ${event.openIssues} open, ${event.closedIssues} closed, ${event.prs} PRs`,
      );
      break;
    case 'analyze:session:dispatching':
      ctx.startSpinner(`Dispatching session for ${event.goal}…`);
      break;
    case 'analyze:session:started':
      ctx.stopSpinner(`Session started: ${event.id}`);
      ctx.info(`  ${sessionUrl(event.id)}`);
      break;
    case 'analyze:session:failed':
      ctx.stopSpinner();
      ctx.error(`  Failed: ${event.error}`);
      break;
    case 'analyze:done':
      ctx.success(
        `Analysis complete — ${event.sessionsStarted} session(s) from ${event.goalsProcessed} goal(s)`,
      );
      break;
  }
}
