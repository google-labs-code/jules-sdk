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
import { ScanInputSchema } from '../../reconcile/schemas.js';

describe('ScanInputSchema validation', () => {
  // ─── Group A: JSON Input Validation (Schema Layer) ──────────

  it('A1: rejects when neither prs nor all is provided', () => {
    expect(() =>
      ScanInputSchema.parse({ repo: 'owner/repo', base: 'main' }),
    ).toThrow();
  });

  it('A2: rejects when both prs and all are provided', () => {
    expect(() =>
      ScanInputSchema.parse({
        prs: [1, 2],
        all: true,
        repo: 'owner/repo',
        base: 'main',
      }),
    ).toThrow();
  });

  it('A3: rejects prs as empty array without all', () => {
    expect(() =>
      ScanInputSchema.parse({ prs: [], repo: 'owner/repo', base: 'main' }),
    ).toThrow();
  });

  it('A4: accepts prs without all (existing behavior)', () => {
    const result = ScanInputSchema.parse({
      prs: [1, 2],
      repo: 'owner/repo',
      base: 'main',
    });
    expect(result.prs).toEqual([1, 2]);
    expect(result.all).toBeUndefined();
  });

  it('A5: accepts all without prs', () => {
    const result = ScanInputSchema.parse({
      all: true,
      repo: 'owner/repo',
      base: 'main',
    });
    expect(result.all).toBe(true);
    expect(result.prs).toBeUndefined();
  });

  it('A6: accepts all with optional maxPrs and labels', () => {
    const result = ScanInputSchema.parse({
      all: true,
      repo: 'owner/repo',
      base: 'main',
      maxPrs: 50,
      labels: ['jules-bot'],
    });
    expect(result.maxPrs).toBe(50);
    expect(result.labels).toEqual(['jules-bot']);
  });

  it('A7: rejects maxPrs as zero or negative', () => {
    expect(() =>
      ScanInputSchema.parse({
        all: true,
        repo: 'owner/repo',
        base: 'main',
        maxPrs: 0,
      }),
    ).toThrow();

    expect(() =>
      ScanInputSchema.parse({
        all: true,
        repo: 'owner/repo',
        base: 'main',
        maxPrs: -5,
      }),
    ).toThrow();
  });

  it('A8: rejects all:false without prs', () => {
    expect(() =>
      ScanInputSchema.parse({
        all: false,
        repo: 'owner/repo',
        base: 'main',
      }),
    ).toThrow();
  });

  it('A9: rejects prs with non-number elements', () => {
    expect(() =>
      ScanInputSchema.parse({
        prs: ['abc'],
        repo: 'owner/repo',
        base: 'main',
      }),
    ).toThrow();
  });
});
