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

import type { DispatchEvent } from '../../events/dispatch.js';
import type { RenderContext } from '../spec.js';
import { sessionUrl } from '../session-url.js';

/** Render a dispatch-domain event. */
export function renderDispatchEvent(event: DispatchEvent, ctx: RenderContext): void {
  switch (event.type) {
    case 'dispatch:start':
      ctx.info(`Dispatching from milestone ${event.milestone}`);
      break;
    case 'dispatch:scanning':
      ctx.startSpinner('Scanning for fleet issues…');
      break;
    case 'dispatch:found':
      ctx.stopSpinner(`Found ${event.count} undispatched issue(s)`);
      break;
    case 'dispatch:issue:dispatching':
      ctx.startSpinner(`#${event.number}: ${event.title}`);
      break;
    case 'dispatch:issue:dispatched':
      ctx.stopSpinner(`#${event.number} → session ${event.sessionId}`);
      ctx.info(`  ${sessionUrl(event.sessionId)}`);
      break;
    case 'dispatch:issue:skipped':
      ctx.warn(`  ⊘ #${event.number}: ${event.reason}`);
      break;
    case 'dispatch:done':
      ctx.success(
        `Dispatch complete — ${event.dispatched} dispatched, ${event.skipped} skipped`,
      );
      break;
  }
}
