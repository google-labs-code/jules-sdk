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
  buildFileOwnership,
  detectOverlaps,
  clusterIssues,
} from '../analyze/overlap/handler.js';

describe('buildFileOwnership', () => {
  it('maps files to their owning issue numbers', () => {
    const ownership = buildFileOwnership([
      { number: 1, targetFiles: ['a.py', 'b.py'] },
      { number: 2, targetFiles: ['b.py', 'c.py'] },
    ]);

    expect(ownership.get('a.py')).toEqual([1]);
    expect(ownership.get('b.py')).toEqual([1, 2]);
    expect(ownership.get('c.py')).toEqual([2]);
  });

  it('handles issues with no files', () => {
    const ownership = buildFileOwnership([
      { number: 1, targetFiles: [] },
    ]);
    expect(ownership.size).toBe(0);
  });

  it('handles duplicate files within same issue', () => {
    const ownership = buildFileOwnership([
      { number: 1, targetFiles: ['a.py', 'a.py'] },
    ]);
    // Both references are kept — the caller decides how to handle
    expect(ownership.get('a.py')).toEqual([1, 1]);
  });
});

describe('detectOverlaps', () => {
  it('returns empty when no files are shared', () => {
    const ownership = new Map<string, number[]>([
      ['a.py', [1]],
      ['b.py', [2]],
    ]);
    expect(detectOverlaps(ownership)).toEqual([]);
  });

  it('detects files shared by multiple issues', () => {
    const ownership = new Map<string, number[]>([
      ['a.py', [1]],
      ['b.py', [1, 2]],
      ['c.py', [2, 3]],
    ]);

    const overlaps = detectOverlaps(ownership);
    expect(overlaps).toHaveLength(2);
    expect(overlaps).toContainEqual({ file: 'b.py', issues: [1, 2] });
    expect(overlaps).toContainEqual({ file: 'c.py', issues: [2, 3] });
  });

  it('sorts issue numbers within an overlap', () => {
    const ownership = new Map<string, number[]>([
      ['a.py', [5, 2, 8]],
    ]);
    const overlaps = detectOverlaps(ownership);
    expect(overlaps[0].issues).toEqual([2, 5, 8]);
  });
});

describe('clusterIssues', () => {
  it('returns empty when no overlaps exist', () => {
    const clusters = clusterIssues([], [1, 2, 3]);
    expect(clusters).toEqual([]);
  });

  it('groups issues sharing a file into one cluster', () => {
    const overlaps = [{ file: 'a.py', issues: [1, 2] }];
    const clusters = clusterIssues(overlaps, [1, 2, 3]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].issues).toEqual([1, 2]);
    expect(clusters[0].sharedFiles).toEqual(['a.py']);
  });

  it('separates independent clusters', () => {
    const overlaps = [
      { file: 'a.py', issues: [1, 2] },
      { file: 'b.py', issues: [3, 4] },
    ];
    const clusters = clusterIssues(overlaps, [1, 2, 3, 4, 5]);

    expect(clusters).toHaveLength(2);
    const clusterIssueArrays = clusters.map((c) => c.issues);
    expect(clusterIssueArrays).toContainEqual([1, 2]);
    expect(clusterIssueArrays).toContainEqual([3, 4]);
  });

  it('transitively merges clusters via shared files', () => {
    const overlaps = [
      { file: 'a.py', issues: [1, 2] },
      { file: 'b.py', issues: [2, 3] },
    ];
    const clusters = clusterIssues(overlaps, [1, 2, 3]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].issues).toEqual([1, 2, 3]);
    expect(clusters[0].sharedFiles).toEqual(['a.py', 'b.py']);
  });
});
