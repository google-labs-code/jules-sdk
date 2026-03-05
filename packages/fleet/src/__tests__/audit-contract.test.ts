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
import {
  AuditInputSchema,
  AuditSuccessSchema,
  AuditFailureSchema,
  AuditResultSchema,
} from '../audit/spec.js';
import {
  AuditFindingSchema,
  AuditFindingTypeSchema,
  AuditFindingSeveritySchema,
  AuditFixabilitySchema,
} from '../audit/findings.js';
import {
  SerializedGraphSchema,
  SerializedNodeSchema,
  SerializedEdgeSchema,
  SerializedUnresolvedEdgeSchema,
} from '../audit/graph/serialize.js';

// ────────────────────────────────────────────────────────────────────
// CONTRACT TESTS — TSC Schema Validation
//
// The "Bouncer": ensure invalid data is rejected before reaching
// the handler. Data-driven style per TSC testing strategy.
// ────────────────────────────────────────────────────────────────────

describe('AuditInputSchema contract', () => {
  it('parses minimal valid input', () => {
    const result = AuditInputSchema.safeParse({ owner: 'foo', repo: 'bar' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeGraph).toBe(false);
      expect(result.data.fixMode).toBe('off');
      expect(result.data.depth).toBe(2);
      expect(result.data.format).toBe('human');
      expect(result.data.entryPoint).toEqual({ kind: 'full' });
    }
  });

  const invalidInputCases = [
    { input: {}, desc: 'empty object' },
    { input: { owner: '' }, desc: 'empty owner' },
    { input: { owner: 'foo' }, desc: 'missing repo' },
    { input: { owner: 'foo', repo: '' }, desc: 'empty repo' },
    { input: { owner: 'foo', repo: 'bar', depth: -1 }, desc: 'depth below min' },
    { input: { owner: 'foo', repo: 'bar', depth: 6 }, desc: 'depth above max' },
    { input: { owner: 'foo', repo: 'bar', format: 'xml' }, desc: 'invalid format' },
  ];

  it.each(invalidInputCases)('rejects $desc', ({ input }) => {
    const result = AuditInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('AuditFindingSchema contract', () => {
  const validFinding = {
    type: 'issue:missing-label',
    severity: 'warning',
    fixability: 'deterministic',
    nodeId: 'issue:42',
    detail: 'Missing fleet label',
    fixed: false,
  };

  it('accepts valid finding', () => {
    const result = AuditFindingSchema.safeParse(validFinding);
    expect(result.success).toBe(true);
  });

  const invalidCases = [
    { input: { ...validFinding, type: 'invalid:type' }, desc: 'invalid finding type' },
    { input: { ...validFinding, severity: 'critical' }, desc: 'invalid severity' },
    { input: { ...validFinding, fixability: 'magic' }, desc: 'invalid fixability' },
    { input: { ...validFinding, nodeId: 42 }, desc: 'nodeId as number' },
    { input: { ...validFinding, fixed: 'yes' }, desc: 'fixed as string' },
    { input: { type: 'issue:missing-label' }, desc: 'missing required fields' },
  ];

  it.each(invalidCases)('rejects $desc', ({ input }) => {
    const result = AuditFindingSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('AuditSuccessSchema contract', () => {
  const validSuccess = {
    success: true,
    data: {
      findings: [],
      fixedCount: 0,
      totalFindings: 0,
      nodesScanned: 1,
      unresolvedEdges: 0,
    },
  };

  it('accepts valid success result', () => {
    const result = AuditSuccessSchema.safeParse(validSuccess);
    expect(result.success).toBe(true);
  });

  it('accepts success with graph', () => {
    const withGraph = {
      ...validSuccess,
      data: {
        ...validSuccess.data,
        graph: {
          root: 'issue:1',
          nodes: {
            'issue:1': { kind: 'issue', id: '1', edges: [] },
          },
          unresolvedEdges: [],
          stats: { totalNodes: 1, totalEdges: 0, totalUnresolved: 0 },
        },
      },
    };
    const result = AuditSuccessSchema.safeParse(withGraph);
    expect(result.success).toBe(true);
  });

  it('rejects success with wrong literal', () => {
    const result = AuditSuccessSchema.safeParse({
      ...validSuccess,
      success: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects success with missing data fields', () => {
    const result = AuditSuccessSchema.safeParse({
      success: true,
      data: { findings: [] },
    });
    expect(result.success).toBe(false);
  });
});

describe('AuditFailureSchema contract', () => {
  const validFailure = {
    success: false,
    error: {
      code: 'GITHUB_API_ERROR',
      message: 'Rate limited',
      recoverable: true,
    },
  };

  it('accepts valid failure result', () => {
    const result = AuditFailureSchema.safeParse(validFailure);
    expect(result.success).toBe(true);
  });

  it('rejects unknown error code', () => {
    const result = AuditFailureSchema.safeParse({
      ...validFailure,
      error: { ...validFailure.error, code: 'NETWORK_DOWN' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects failure with wrong literal', () => {
    const result = AuditFailureSchema.safeParse({
      ...validFailure,
      success: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('AuditResultSchema discriminated union', () => {
  it('discriminates success', () => {
    const success = {
      success: true,
      data: {
        findings: [],
        fixedCount: 0,
        totalFindings: 0,
        nodesScanned: 0,
        unresolvedEdges: 0,
      },
    };
    const result = AuditResultSchema.safeParse(success);
    expect(result.success).toBe(true);
  });

  it('discriminates failure', () => {
    const failure = {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'Something broke',
        recoverable: false,
      },
    };
    const result = AuditResultSchema.safeParse(failure);
    expect(result.success).toBe(true);
  });
});

describe('SerializedGraphSchema contract', () => {
  it('accepts valid graph', () => {
    const graph = {
      root: 'issue:1',
      nodes: {
        'issue:1': {
          kind: 'issue',
          id: '1',
          title: 'Test',
          edges: [{ relation: 'fixes', target: 'pr:2', resolved: true }],
        },
      },
      unresolvedEdges: [],
      stats: { totalNodes: 1, totalEdges: 1, totalUnresolved: 0 },
    };
    const result = SerializedGraphSchema.safeParse(graph);
    expect(result.success).toBe(true);
  });

  it('rejects graph with missing stats', () => {
    const result = SerializedGraphSchema.safeParse({
      root: 'issue:1',
      nodes: {},
      unresolvedEdges: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects node with missing edges array', () => {
    const result = SerializedNodeSchema.safeParse({
      kind: 'issue',
      id: '1',
    });
    expect(result.success).toBe(false);
  });
});
