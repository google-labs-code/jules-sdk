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
import { DispatchInputSchema } from '../dispatch/spec.js';
import { MergeInputSchema } from '../merge/spec.js';
import { ConfigureInputSchema } from '../configure/spec.js';
import { SignalCreateInputSchema } from '../signal/spec.js';

// ── Contract Tests: Dry-Run Spec Fields ─────────────────────────────
// These verify the Zod schemas accept the new dryRun field.

describe('DispatchInputSchema dryRun', () => {
  const baseInput = {
    milestone: '1',
    owner: 'google',
    repo: 'jules-sdk',
  };

  it('defaults dryRun to false', () => {
    const result = DispatchInputSchema.parse(baseInput);
    expect(result.dryRun).toBe(false);
  });

  it('accepts dryRun: true', () => {
    const result = DispatchInputSchema.parse({ ...baseInput, dryRun: true });
    expect(result.dryRun).toBe(true);
  });
});

describe('MergeInputSchema dryRun', () => {
  const baseInput = {
    owner: 'google',
    repo: 'jules-sdk',
  };

  it('defaults dryRun to false', () => {
    const result = MergeInputSchema.parse(baseInput);
    expect(result.dryRun).toBe(false);
  });

  it('accepts dryRun: true', () => {
    const result = MergeInputSchema.parse({ ...baseInput, dryRun: true });
    expect(result.dryRun).toBe(true);
  });
});

// ── Contract Tests: Dry-Run Preview Shape ───────────────────────────
// These verify that parsed spec inputs produce well-formed preview payloads
// matching the shape the CLI commands would construct.

describe('signal create dry-run preview shape', () => {
  it('schema-parsed input contains all fields needed for preview', () => {
    const input = SignalCreateInputSchema.parse({
      owner: 'google',
      repo: 'jules-sdk',
      title: 'Test signal',
      body: 'Test body',
      kind: 'assessment',
    });

    // The CLI constructs preview from parsed input — verify these exist
    expect(input.kind).toBe('assessment');
    expect(input.title).toBe('Test signal');
    expect(input.owner).toBe('google');
    expect(input.repo).toBe('jules-sdk');
    // Optional fields: tags has default [], scope is truly optional
    expect(input).toHaveProperty('tags');
    expect(input.scope).toBeUndefined();
  });
});

describe('configure dry-run preview shape', () => {
  it('schema-parsed input contains all fields needed for preview', () => {
    const input = ConfigureInputSchema.parse({
      resource: 'labels',
      action: 'create',
      owner: 'google',
      repo: 'jules-sdk',
    });

    expect(input.action).toBe('create');
    expect(input.resource).toBe('labels');
    expect(input.owner).toBe('google');
    expect(input.repo).toBe('jules-sdk');
  });
});
