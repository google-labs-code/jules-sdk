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
import { renderInitEvent } from '../shared/ui/render/init.js';
import type { RenderContext } from '../shared/ui/spec.js';
import {
  ansiLink,
  ansiYellow,
  ansiRed,
  ansiGreen,
  ansiHighlight,
} from '../shared/ui/session-url.js';

describe('renderInitEvent', () => {
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

  it('renders init:repo:creating correctly', () => {
    const { ctx, logs } = createMockCtx();
    renderInitEvent(
      {
        type: 'init:repo:creating',
        owner: 'google',
        name: 'jules',
      },
      ctx,
    );
    expect(logs).toContain(
      `startSpinner: Creating repository ${ansiHighlight('`google/jules`')}…`,
    );
  });

  it('renders init:repo:created correctly with clickable repository url', () => {
    const { ctx, logs } = createMockCtx();
    renderInitEvent(
      {
        type: 'init:repo:created',
        fullName: 'google/jules',
        url: 'https://github.com/google/jules',
      },
      ctx,
    );
    expect(logs).toContain(
      `stopSpinner: Repository ${ansiHighlight('`google/jules`')} created ${ansiGreen('✓')}`,
    );
    const expectedLink = ansiLink(
      'View Repository',
      'https://github.com/google/jules',
    );
    expect(logs).toContain(`info:   ${expectedLink}`);
  });

  it('renders init:repo:exists with warning symbol', () => {
    const { ctx, logs } = createMockCtx();
    renderInitEvent(
      {
        type: 'init:repo:exists',
        fullName: 'google/jules',
      },
      ctx,
    );
    expect(logs).toContain(
      `warn:   ${ansiYellow('⊘')} Repository ${ansiHighlight('`google/jules`')} already exists`,
    );
  });

  it('renders init:repo:failed and stops spinner', () => {
    const { ctx, logs } = createMockCtx();
    renderInitEvent(
      {
        type: 'init:repo:failed',
        reason: 'API Error',
      },
      ctx,
    );
    expect(logs).toContain('stopSpinner');
    expect(logs).toContain(
      `error:   ${ansiRed('✗')} Repository creation failed: API Error`,
    );
  });

  it('renders init:start correctly', () => {
    const { ctx, logs } = createMockCtx();
    renderInitEvent(
      {
        type: 'init:start',
        owner: 'google',
        repo: 'jules',
      },
      ctx,
    );
    expect(logs).toContain(
      `info: Initializing fleet for ${ansiHighlight('`google/jules`')}`,
    );
  });

  it('renders init:branch:creating correctly', () => {
    const { ctx, logs } = createMockCtx();
    renderInitEvent(
      {
        type: 'init:branch:creating',
        name: 'fleet-setup',
        base: 'main',
      },
      ctx,
    );
    expect(logs).toContain(
      `startSpinner: Creating branch ${ansiHighlight('`fleet-setup`')} from ${ansiHighlight('`main`')}`,
    );
  });

  it('renders init:branch:created correctly', () => {
    const { ctx, logs } = createMockCtx();
    renderInitEvent(
      {
        type: 'init:branch:created',
        name: 'fleet-setup',
      },
      ctx,
    );
    expect(logs).toContain(
      `stopSpinner: Branch ${ansiHighlight('`fleet-setup`')} created ${ansiGreen('✓')}`,
    );
  });

  it('renders init:file:committed correctly', () => {
    const { ctx, logs } = createMockCtx();
    renderInitEvent(
      {
        type: 'init:file:committed',
        path: '.fleet/goals/example.md',
      },
      ctx,
    );
    expect(logs).toContain(
      `info:   ${ansiGreen('✓')} ${ansiHighlight('`.fleet/goals/example.md`')}`,
    );
  });

  it('renders init:file:skipped correctly', () => {
    const { ctx, logs } = createMockCtx();
    renderInitEvent(
      {
        type: 'init:file:skipped',
        path: '.fleet/goals/example.md',
        reason: 'File already exists',
      },
      ctx,
    );
    expect(logs).toContain(
      `warn:   ${ansiYellow('⊘')} ${ansiHighlight('`.fleet/goals/example.md`')} — File already exists`,
    );
  });
});
