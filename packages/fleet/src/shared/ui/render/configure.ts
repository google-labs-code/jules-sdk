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

import type { ConfigureEvent } from '../../events/configure.js';
import type { RenderContext } from '../spec.js';

/** Render a configure-domain event. */
export function renderConfigureEvent(event: ConfigureEvent, ctx: RenderContext): void {
  switch (event.type) {
    case 'configure:start':
      ctx.info(`Configuring ${event.resource} for ${event.owner}/${event.repo}`);
      break;
    case 'configure:label:created':
      ctx.info(`  ✓ Label "${event.name}" created`);
      break;
    case 'configure:label:exists':
      ctx.warn(`  ⊘ Label "${event.name}" already exists`);
      break;
    case 'configure:secret:uploading':
      ctx.startSpinner(`Uploading secret ${event.name}…`);
      break;
    case 'configure:secret:uploaded':
      ctx.stopSpinner(`Secret ${event.name} uploaded`);
      break;
    case 'configure:done':
      ctx.success('Configuration complete');
      break;
  }
}
