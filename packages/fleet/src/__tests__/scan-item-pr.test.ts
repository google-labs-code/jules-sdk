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
import { scanItem } from '../audit/ops/scan-item.js';
import type { GraphNode } from '../audit/graph/types.js';

describe('scanItem: PR label detection', () => {
  it('does NOT flag pr:missing-label when fleet-merge-ready label is present', () => {
    const prNode: GraphNode = {
      ref: { kind: 'pr', id: '145' },
      data: {
        number: 145,
        title: 'Fix something',
        state: 'open',
        // This is the critical data — labels must be present on PR nodes
        labels: [{ name: 'fleet-merge-ready' }],
        headRef: 'fix/something',
        headSha: 'abc123',
        merged: false,
        body: 'Fixes #100',
        milestone: null,
      },
      edges: [
        // PR linked to a fleet issue (this is what triggers the label check)
        { relation: 'fixes', target: { kind: 'issue', id: '100' }, resolved: true },
      ],
    };

    const findings = scanItem(prNode, []);
    const labelFindings = findings.filter((f) => f.type === 'pr:missing-label');

    expect(labelFindings).toHaveLength(0);
  });

  it('DOES flag pr:missing-label when label is absent', () => {
    const prNode: GraphNode = {
      ref: { kind: 'pr', id: '200' },
      data: {
        number: 200,
        title: 'Another fix',
        state: 'open',
        labels: [{ name: 'bug' }], // no fleet-merge-ready
        headRef: 'fix/another',
        headSha: 'def456',
        merged: false,
        body: 'Fixes #101',
        milestone: null,
      },
      edges: [
        { relation: 'fixes', target: { kind: 'issue', id: '101' }, resolved: true },
      ],
    };

    const findings = scanItem(prNode, []);
    const labelFindings = findings.filter((f) => f.type === 'pr:missing-label');

    expect(labelFindings).toHaveLength(1);
    expect(labelFindings[0].fixability).toBe('deterministic');
  });

  it('does NOT flag pr:missing-label when PR has no linked issues', () => {
    const prNode: GraphNode = {
      ref: { kind: 'pr', id: '300' },
      data: {
        number: 300,
        title: 'Unrelated PR',
        state: 'open',
        labels: [], // no labels at all
        headRef: 'feature/unrelated',
        headSha: 'ghi789',
        merged: false,
        body: 'Some changes',
        milestone: null,
      },
      edges: [], // no linked issues → no label check needed
    };

    const findings = scanItem(prNode, []);
    const labelFindings = findings.filter((f) => f.type === 'pr:missing-label');

    expect(labelFindings).toHaveLength(0);
  });
});
