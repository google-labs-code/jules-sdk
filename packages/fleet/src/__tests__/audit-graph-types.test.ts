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
import { nodeKey } from '../audit/graph/types.js';
import type { NodeRef, GraphEdge, UnresolvedEdge } from '../audit/graph/types.js';

describe('Graph Types', () => {
  describe('nodeKey', () => {
    it('serializes issue ref', () => {
      const ref: NodeRef = { kind: 'issue', id: '42' };
      expect(nodeKey(ref)).toBe('issue:42');
    });

    it('serializes PR ref', () => {
      const ref: NodeRef = { kind: 'pr', id: '99' };
      expect(nodeKey(ref)).toBe('pr:99');
    });

    it('serializes session ref', () => {
      const ref: NodeRef = { kind: 'session', id: 's-abc123' };
      expect(nodeKey(ref)).toBe('session:s-abc123');
    });

    it('produces unique keys for different kinds with same id', () => {
      const issueRef: NodeRef = { kind: 'issue', id: '42' };
      const prRef: NodeRef = { kind: 'pr', id: '42' };
      expect(nodeKey(issueRef)).not.toBe(nodeKey(prRef));
    });
  });

  describe('type contracts', () => {
    it('GraphEdge supports all expected relations', () => {
      const relations: GraphEdge['relation'][] = [
        'created', 'fixes', 'produced', 'belongs-to', 'has-check', 'dispatched', 'triggered',
      ];
      // Just verify the type works — if this compiles, the types are correct
      for (const relation of relations) {
        const edge: GraphEdge = {
          relation,
          target: { kind: 'issue', id: '1' },
          resolved: true,
        };
        expect(edge.relation).toBe(relation);
      }
    });

    it('UnresolvedEdge captures reason', () => {
      const edge: UnresolvedEdge = {
        from: { kind: 'issue', id: '42' },
        expectedRelation: 'dispatched',
        reason: 'No Fleet Context footer in issue body',
      };
      expect(edge.reason).toContain('Fleet Context');
    });
  });
});
