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

import { describe, it, expect } from 'vitest';
import { renderDispatchEvent } from '../shared/ui/render/dispatch.js';
import type { RenderContext } from '../shared/ui/spec.js';
import {
  sessionUrl,
  ansiLink,
  ansiYellow,
  ansiGreen,
  ansiHighlight,
} from '../shared/ui/session-url.js';

describe('renderDispatchEvent', () => {
  const createMockCtx = () => {
    const logs: string[] = [];
    const ctx: RenderContext = {
      info: (msg) => logs.push(`info: ${msg}`),
      success: (msg) => logs.push(`success: ${msg}`),
      warn: (msg) => logs.push(`warn: ${msg}`),
      error: (msg) => logs.push(`error: ${msg}`),
      message: (msg) => logs.push(`message: ${msg}`),
      step: (msg) => logs.push(`step: ${msg}`),
      startSpinner: (msg) => logs.push(`startSpinner: ${msg}`),
      stopSpinner: (msg) => logs.push(`stopSpinner${msg ? `: ${msg}` : ''}`),
    };
    return { ctx, logs };
  };

  it('renders dispatch:start correctly', () => {
    const { ctx, logs } = createMockCtx();
    renderDispatchEvent(
      {
        type: 'dispatch:start',
        milestone: 'v1.0',
      },
      ctx,
    );
    expect(logs).toContain(
      `info: Dispatching from milestone ${ansiHighlight('`v1.0`')}`,
    );
  });

  it('renders dispatch:issue:skipped with styled yellow warning icon', () => {
    const { ctx, logs } = createMockCtx();
    renderDispatchEvent(
      {
        type: 'dispatch:issue:skipped',
        number: 101,
        reason: 'Already dispatched',
      },
      ctx,
    );
    expect(logs).toContain(
      `warn:   ${ansiYellow('⊘')} #101: Already dispatched`,
    );
  });

  it('renders dispatch:issue:dispatched with clickable session url', () => {
    const { ctx, logs } = createMockCtx();
    renderDispatchEvent(
      {
        type: 'dispatch:issue:dispatched',
        number: 42,
        sessionId: 'session_xyz_789',
      },
      ctx,
    );
    expect(logs).toContain(
      `stopSpinner: #42 → session ${ansiHighlight('`session_xyz_789`')} ${ansiGreen('✓')}`,
    );
    const expectedLink = ansiLink(
      'View Session',
      sessionUrl('session_xyz_789'),
    );
    expect(logs).toContain(`info:   ${expectedLink}`);
  });
});
