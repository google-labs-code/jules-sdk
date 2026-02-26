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

/**
 * FleetRenderer interface — the UI contract.
 * Implementations render FleetEvents into terminal output.
 */
export interface FleetRenderer {
  /** Render a single event */
  render(event: FleetEvent): void;

  /** Start the UI (e.g., intro banner) */
  start(title: string): void;

  /** End the UI (e.g., outro message) */
  end(message: string): void;

  /** End the UI with an error */
  error(message: string): void;
}

/**
 * RenderContext abstracts the difference between interactive (clack) and plain
 * (console) rendering. Domain-specific render functions depend on this
 * interface instead of coupling to @clack/prompts or console directly.
 */
export interface RenderContext {
  info(msg: string): void;
  success(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  message(msg: string): void;
  step(msg: string): void;
  startSpinner(msg: string): void;
  stopSpinner(msg?: string): void;
}
