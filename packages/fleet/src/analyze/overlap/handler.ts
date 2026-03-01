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

import type {
  OverlapInput,
  OverlapResult,
  OverlapSpec,
  FileOverlap,
  IssueCluster,
} from './spec.js';
import { ok, fail } from '../../shared/result/index.js';
import { UnionFind } from '../../shared/union-find.js';

// ── Pure Functions (independently testable) ─────────────────────────

/**
 * Build a map of file → issue numbers that reference it.
 * Pure function — no side effects.
 */
export function buildFileOwnership(
  issues: OverlapInput['issues'],
): Map<string, number[]> {
  const ownership = new Map<string, number[]>();
  for (const issue of issues) {
    for (const file of issue.targetFiles) {
      if (!ownership.has(file)) {
        ownership.set(file, []);
      }
      ownership.get(file)!.push(issue.number);
    }
  }
  return ownership;
}

/**
 * Extract files owned by 2+ issues from the ownership map.
 * Pure function — no side effects.
 */
export function detectOverlaps(
  ownership: Map<string, number[]>,
): FileOverlap[] {
  const overlaps: FileOverlap[] = [];
  for (const [file, issues] of ownership) {
    if (issues.length > 1) {
      overlaps.push({ file, issues: [...issues].sort((a, b) => a - b) });
    }
  }
  return overlaps;
}

/**
 * Group overlapping issues into clusters via union-find.
 * Pure function — no side effects.
 */
export function clusterIssues(
  overlaps: FileOverlap[],
  allIssueNumbers: number[],
): IssueCluster[] {
  const uf = new UnionFind<number>();
  for (const num of allIssueNumbers) {
    uf.makeSet(num);
  }

  for (const overlap of overlaps) {
    for (let i = 1; i < overlap.issues.length; i++) {
      uf.union(overlap.issues[0], overlap.issues[i]);
    }
  }

  const groups = uf.groups();
  return groups
    .map((issues) => issues.sort((a, b) => a - b))
    .filter((g) => g.length > 1)
    .map((issues) => {
      const clusterIssueSet = new Set(issues);
      const sharedFiles = overlaps
        .filter((o) => o.issues.some((i) => clusterIssueSet.has(i)))
        .map((o) => o.file);
      return {
        issues,
        sharedFiles: [...new Set(sharedFiles)].sort(),
      };
    });
}

// ── Handler (orchestrates pure functions) ────────────────────────────

/**
 * Detects file overlaps across fleet issues and groups them into clusters.
 *
 * Pure computation — no I/O or side effects. Orchestrates decomposed
 * functions that are independently testable.
 */
export class OverlapHandler implements OverlapSpec {
  execute(input: OverlapInput): OverlapResult {
    try {
      if (input.issues.length === 0) {
        return fail('NO_ISSUES', 'No issues provided for overlap detection', true);
      }

      const ownership = buildFileOwnership(input.issues);
      const overlaps = detectOverlaps(ownership);

      if (overlaps.length === 0) {
        return ok({ clean: true, overlaps: [], clusters: [] });
      }

      const issueNumbers = input.issues.map((i) => i.number);
      const clusters = clusterIssues(overlaps, issueNumbers);

      return ok({ clean: false, overlaps, clusters });
    } catch (error) {
      return fail(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }
  }
}
