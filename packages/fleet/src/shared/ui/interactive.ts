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
import type { FleetRenderer, RenderContext } from './spec.js';
import { renderInitEvent } from './render/init.js';
import { renderConfigureEvent } from './render/configure.js';
import { renderAnalyzeEvent } from './render/analyze.js';
import { renderDispatchEvent } from './render/dispatch.js';
import { renderMergeEvent } from './render/merge.js';
import { renderErrorEvent } from './render/error.js';
import type { InitEvent } from '../events/init.js';
import type { ConfigureEvent } from '../events/configure.js';
import type { AnalyzeEvent } from '../events/analyze.js';
import type { DispatchEvent } from '../events/dispatch.js';
import type { MergeEvent } from '../events/merge.js';
import type { ErrorEvent } from '../events/error.js';

/**
 * InteractiveRenderer uses @clack/prompts for rich TUI output.
 * Used when stdout is a TTY (local development).
 *
 * This is a thin shell — all domain-specific rendering is delegated
 * to per-domain functions in render/*.ts via the RenderContext interface.
 */
export class InteractiveRenderer implements FleetRenderer {
  private spinner: ReturnType<typeof p.spinner> | null = null;

  private ctx: RenderContext = {
    info: (msg) => p.log.info(msg),
    success: (msg) => p.log.success(msg),
    warn: (msg) => p.log.warn(msg),
    error: (msg) => p.log.error(msg),
    message: (msg) => p.log.message(msg),
    step: (msg) => p.log.step(msg),
    startSpinner: (msg) => this.startSpinner(msg),
    stopSpinner: (msg) => this.stopSpinner(msg),
  };

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
    if (event.type.startsWith('init:')) return renderInitEvent(event as InitEvent, this.ctx);
    if (event.type.startsWith('configure:')) return renderConfigureEvent(event as ConfigureEvent, this.ctx);
    if (event.type.startsWith('analyze:')) return renderAnalyzeEvent(event as AnalyzeEvent, this.ctx);
    if (event.type.startsWith('dispatch:')) return renderDispatchEvent(event as DispatchEvent, this.ctx);
    if (event.type.startsWith('merge:')) return renderMergeEvent(event as MergeEvent, this.ctx);
    if (event.type === 'error') return renderErrorEvent(event as ErrorEvent, this.ctx);
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
