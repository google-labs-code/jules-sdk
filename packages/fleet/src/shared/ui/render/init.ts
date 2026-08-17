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

import type { InitEvent } from '../../events/init.js';
import type { RenderContext } from '../spec.js';
import {
  ansiLink,
  ansiGreen,
  ansiYellow,
  ansiRed,
  ansiHighlight,
} from '../session-url.js';

/** Render an init-domain event. */
export function renderInitEvent(event: InitEvent, ctx: RenderContext): void {
  switch (event.type) {
    case 'init:start':
      ctx.info(
        `Initializing fleet for ${ansiHighlight(`\`${event.owner}/${event.repo}\``)}`,
      );
      break;
    case 'init:branch:creating':
      ctx.startSpinner(
        `Creating branch ${ansiHighlight(`\`${event.name}\``)} from ${ansiHighlight(`\`${event.base}\``)}`,
      );
      break;
    case 'init:branch:created':
      ctx.stopSpinner(
        `Branch ${ansiHighlight(`\`${event.name}\``)} created ${ansiGreen('✓')}`,
      );
      break;
    case 'init:file:committed':
      ctx.info(`  ${ansiGreen('✓')} ${ansiHighlight(`\`${event.path}\``)}`);
      break;
    case 'init:file:skipped':
      ctx.warn(
        `  ${ansiYellow('⊘')} ${ansiHighlight(`\`${event.path}\``)} — ${ansiHighlight(event.reason)}`,
      );
      break;
    case 'init:pr:creating':
      ctx.startSpinner('Creating pull request…');
      break;
    case 'init:pr:created':
      ctx.stopSpinner(`PR #${event.number} created ${ansiGreen('✓')}`);
      ctx.info(`  ${ansiLink('View Pull Request', event.url)}`);
      break;
    case 'init:done':
      ctx.success(
        `Fleet initialized — PR: ${ansiLink('View Pull Request', event.prUrl)}`,
      );
      break;
    case 'init:auth:detected':
      ctx.success(
        `Auth: ${event.method === 'token' ? 'GITHUB_TOKEN' : 'GitHub App'}`,
      );
      break;
    case 'init:secret:uploading':
      ctx.startSpinner(`Uploading secret ${event.name}…`);
      break;
    case 'init:secret:uploaded':
      ctx.stopSpinner(`Secret ${event.name} saved ${ansiGreen('✓')}`);
      break;
    case 'init:secret:skipped':
      ctx.warn(
        `  ${ansiYellow('⊘')} ${event.name} — ${ansiHighlight(event.reason)}`,
      );
      break;
    case 'init:dry-run':
      ctx.info('Would create:');
      event.files.forEach((f) => ctx.message(`  ${f}`));
      break;
    case 'init:already-initialized':
      ctx.warn('Repository is already initialized');
      break;
    case 'init:repo:creating':
      ctx.startSpinner(
        `Creating repository ${ansiHighlight(`\`${event.owner}/${event.name}\``)}…`,
      );
      break;
    case 'init:repo:created':
      ctx.stopSpinner(
        `Repository ${ansiHighlight(`\`${event.fullName}\``)} created ${ansiGreen('✓')}`,
      );
      ctx.info(`  ${ansiLink('View Repository', event.url)}`);
      break;
    case 'init:repo:exists':
      ctx.warn(
        `  ${ansiYellow('⊘')} Repository ${ansiHighlight(`\`${event.fullName}\``)} already exists`,
      );
      break;
    case 'init:repo:failed':
      ctx.stopSpinner();
      ctx.error(
        `  ${ansiRed('✗')} Repository creation failed: ${ansiHighlight(event.reason)}`,
      );
      break;
  }
}
