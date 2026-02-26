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

import type { FleetRenderer } from './spec.js';
import type { FleetEmitter } from '../events.js';
import { InteractiveRenderer } from './interactive.js';
import { PlainRenderer } from './plain.js';

export type { FleetRenderer } from './spec.js';
export { InteractiveRenderer } from './interactive.js';
export { PlainRenderer } from './plain.js';
export { sessionUrl, repoConfigUrl, ansiLink } from './session-url.js';

/**
 * Detect whether the current environment supports interactive UI.
 */
export function isInteractive(): boolean {
  if (process.env.CI === 'true') return false;
  if (!process.stdout.isTTY) return false;
  return true;
}

/**
 * Create a renderer appropriate for the current environment.
 */
export function createRenderer(interactive?: boolean): FleetRenderer {
  const useInteractive = interactive ?? isInteractive();
  return useInteractive ? new InteractiveRenderer() : new PlainRenderer();
}

/**
 * Create an emitter function that forwards events to a renderer.
 */
export function createEmitter(renderer: FleetRenderer): FleetEmitter {
  return (event) => renderer.render(event);
}
