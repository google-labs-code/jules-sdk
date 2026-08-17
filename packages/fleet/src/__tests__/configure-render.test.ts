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
import { renderConfigureEvent } from '../shared/ui/render/configure.js';
import type { RenderContext } from '../shared/ui/spec.js';
import { repoConfigUrl, ansiLink, ansiGreen, ansiHighlight } from '../shared/ui/session-url.js';

describe('renderConfigureEvent', () => {
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

  it('renders configure:start with clickable configuration url', () => {
    const { ctx, logs } = createMockCtx();
    renderConfigureEvent(
      {
        type: 'configure:start',
        resource: 'labels',
        owner: 'google',
        repo: 'jules',
      },
      ctx,
    );
    expect(logs).toContain(
      `info: Configuring ${ansiHighlight('`labels`')} for ${ansiHighlight('`google/jules`')}`,
    );
    const expectedLink = ansiLink(
      'View Configuration',
      repoConfigUrl('google', 'jules'),
    );
    expect(logs).toContain(`info:   ${expectedLink}`);
  });

  it('renders configure:label:created correctly', () => {
    const { ctx, logs } = createMockCtx();
    renderConfigureEvent(
      {
        type: 'configure:label:created',
        name: 'fleet-merge-ready',
      },
      ctx,
    );
    const expectedLabel = ansiHighlight('`fleet-merge-ready`');
    expect(logs).toContain(`info:   ✓ Label ${expectedLabel} created`);
  });

  it('renders configure:done correctly', () => {
    const { ctx, logs } = createMockCtx();
    renderConfigureEvent(
      {
        type: 'configure:done',
      },
      ctx,
    );
    expect(logs).toContain('success: Configuration complete');
  });

  it('renders configure:secret:uploaded correctly with green checkmark', () => {
    const { ctx, logs } = createMockCtx();
    renderConfigureEvent(
      {
        type: 'configure:secret:uploaded',
        name: 'MY_API_KEY',
      },
      ctx,
    );
    expect(logs).toContain(
      `stopSpinner: Secret MY_API_KEY uploaded ${ansiGreen('✓')}`,
    );
  });
});
