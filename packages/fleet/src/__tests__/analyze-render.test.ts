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
import { renderAnalyzeEvent } from '../shared/ui/render/analyze.js';
import type { RenderContext } from '../shared/ui/spec.js';
import {
  ansiRed,
  ansiLink,
  sessionUrl,
  ansiGreen,
  ansiHighlight,
} from '../shared/ui/session-url.js';

describe('renderAnalyzeEvent', () => {
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

  it('renders analyze:session:failed with red cross mark', () => {
    const { ctx, logs } = createMockCtx();
    renderAnalyzeEvent(
      {
        type: 'analyze:session:failed',
        id: 's-123',
        error: 'Network Timeout',
      },
      ctx,
    );
    expect(logs).toContain('stopSpinner');
    expect(logs).toContain(`error:   ${ansiRed('✗')} Failed: Network Timeout`);
  });

  it('renders analyze:session:started with clickable link', () => {
    const { ctx, logs } = createMockCtx();
    renderAnalyzeEvent(
      {
        type: 'analyze:session:started',
        id: 's-123',
        goal: 'test-goal',
      },
      ctx,
    );
    expect(logs).toContain(
      `stopSpinner: Session started: s-123 ${ansiGreen('✓')}`,
    );
    const expectedLink = ansiLink('View Session', sessionUrl('s-123'));
    expect(logs).toContain(`info:   ${expectedLink}`);
  });

  it('renders analyze:goal:start with backticks and highlights file and milestone', () => {
    const { ctx, logs } = createMockCtx();
    renderAnalyzeEvent(
      {
        type: 'analyze:goal:start',
        file: '.fleet/goals/improve.md',
        index: 1,
        total: 2,
        milestone: 'v1.0',
      },
      ctx,
    );
    expect(logs.some((l) => l.includes('`.fleet/goals/improve.md`'))).toBe(true);
    expect(logs.some((l) => l.includes('`v1.0`'))).toBe(true);
  });
});
