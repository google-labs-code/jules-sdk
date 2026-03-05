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
import { ScanArgsSchema, deriveFixMode } from '../cli/audit/parse-input.js';
import { filterFindings, matchesFilter } from '../cli/audit/filter-findings.js';
import type { AuditFinding } from '../audit/findings.js';

// ── ScanArgsSchema contract tests (Bouncer) ───────────────────────

describe('ScanArgsSchema', () => {
  it('applies boolean defaults', () => {
    const result = ScanArgsSchema.safeParse({
      depth: '2',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fix).toBe(false);
      expect(result.data.apply).toBe(false);
      expect(result.data.json).toBe(false);
      expect(result.data.graph).toBe(false);
      expect(result.data.fixable).toBe(false);
    }
  });

  it('rejects invalid severity', () => {
    const result = ScanArgsSchema.safeParse({
      depth: '2',
      severity: 'critical', // not a valid severity
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid severity values', () => {
    for (const sev of ['error', 'warning', 'info']) {
      const result = ScanArgsSchema.safeParse({ depth: '2', severity: sev });
      expect(result.success).toBe(true);
    }
  });

  it('allows severity to be undefined', () => {
    const result = ScanArgsSchema.safeParse({ depth: '2' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.severity).toBeUndefined();
    }
  });
});

// ── deriveFixMode tests ───────────────────────────────────────────

describe('deriveFixMode', () => {
  const cases = [
    { fix: false, apply: false, expected: 'off' },
    { fix: true, apply: false, expected: 'dry-run' },
    { fix: true, apply: true, expected: 'apply' },
    { fix: false, apply: true, expected: 'off' }, // apply without fix = off
  ] as const;

  it.each(cases)('fix=$fix apply=$apply → $expected', ({ fix, apply, expected }) => {
    expect(deriveFixMode({ fix, apply } as any)).toBe(expected);
  });
});

// ── Filter findings contract tests (Bouncer) ─────────────────────

function makeFinding(overrides: Partial<AuditFinding>): AuditFinding {
  return {
    type: 'issue:undispatched',
    severity: 'warning',
    fixability: 'none',
    nodeId: 'issue:1',
    detail: 'Test finding',
    fixed: false,
    ...overrides,
  } as AuditFinding;
}

describe('matchesFilter', () => {
  const findings = [
    makeFinding({ severity: 'error', fixability: 'deterministic' }),
    makeFinding({ severity: 'warning', fixability: 'deterministic' }),
    makeFinding({ severity: 'warning', fixability: 'cognitive' }),
    makeFinding({ severity: 'info', fixability: 'none' }),
  ];

  describe('--fixable', () => {
    it('keeps only deterministic findings', () => {
      const filtered = findings.filter((f) => matchesFilter(f, { fixable: true }));
      expect(filtered).toHaveLength(2);
      expect(filtered.every((f) => f.fixability === 'deterministic')).toBe(true);
    });
  });

  describe('--severity', () => {
    it('error: keeps only errors', () => {
      const filtered = findings.filter((f) => matchesFilter(f, { fixable: false, severity: 'error' }));
      expect(filtered).toHaveLength(1);
      expect(filtered[0].severity).toBe('error');
    });

    it('warning: keeps warnings and errors', () => {
      const filtered = findings.filter((f) => matchesFilter(f, { fixable: false, severity: 'warning' }));
      expect(filtered).toHaveLength(3);
    });

    it('info: keeps everything', () => {
      const filtered = findings.filter((f) => matchesFilter(f, { fixable: false, severity: 'info' }));
      expect(filtered).toHaveLength(4);
    });
  });

  describe('--fixable --severity (composed)', () => {
    it('fixable + warning: only fixable warnings+', () => {
      const filtered = findings.filter((f) => matchesFilter(f, { fixable: true, severity: 'warning' }));
      expect(filtered).toHaveLength(2);
      expect(filtered.every((f) => f.fixability === 'deterministic')).toBe(true);
      expect(filtered.every((f) => ['error', 'warning'].includes(f.severity))).toBe(true);
    });

    it('fixable + error: only fixable errors', () => {
      const filtered = findings.filter((f) => matchesFilter(f, { fixable: true, severity: 'error' }));
      expect(filtered).toHaveLength(1);
    });
  });
});

describe('filterFindings', () => {
  it('returns all findings with no filters', () => {
    const findings = [makeFinding({}), makeFinding({})];
    expect(filterFindings(findings, { fixable: false })).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(filterFindings([], { fixable: true })).toHaveLength(0);
  });
});
