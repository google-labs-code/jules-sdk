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

import { describe, test, expect } from 'bun:test';
import { OverlapHandler } from '../analyze/overlap/handler.js';

describe('OverlapHandler', () => {
  const handler = new OverlapHandler();

  test('returns clean when no overlaps exist', () => {
    const result = handler.execute({
      issues: [
        { number: 1, targetFiles: ['src/client.py'] },
        { number: 2, targetFiles: ['src/models.py'] },
        { number: 3, targetFiles: ['src/utils.py'] },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clean).toBe(true);
      expect(result.data.overlaps).toEqual([]);
      expect(result.data.clusters).toEqual([]);
    }
  });

  test('detects single file overlap between two issues', () => {
    const result = handler.execute({
      issues: [
        { number: 1, targetFiles: ['src/client.py', 'src/auth.py'] },
        { number: 2, targetFiles: ['src/models.py', 'src/auth.py'] },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clean).toBe(false);
      expect(result.data.overlaps).toEqual([
        { file: 'src/auth.py', issues: [1, 2] },
      ]);
      expect(result.data.clusters).toEqual([
        { issues: [1, 2], sharedFiles: ['src/auth.py'] },
      ]);
    }
  });

  test('detects multiple file overlaps', () => {
    const result = handler.execute({
      issues: [
        { number: 1, targetFiles: ['src/client.py', 'pyproject.toml'] },
        { number: 2, targetFiles: ['src/models.py', 'pyproject.toml'] },
        { number: 3, targetFiles: ['src/utils.py', 'pyproject.toml'] },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clean).toBe(false);
      expect(result.data.overlaps).toEqual([
        { file: 'pyproject.toml', issues: [1, 2, 3] },
      ]);
      // All three should be in one cluster
      expect(result.data.clusters).toHaveLength(1);
      expect(result.data.clusters[0].issues).toEqual([1, 2, 3]);
    }
  });

  test('groups issues into separate clusters when they share different files', () => {
    const result = handler.execute({
      issues: [
        { number: 1, targetFiles: ['src/client.py', 'src/shared-a.py'] },
        { number: 2, targetFiles: ['src/models.py', 'src/shared-a.py'] },
        { number: 3, targetFiles: ['src/utils.py', 'src/shared-b.py'] },
        { number: 4, targetFiles: ['src/config.py', 'src/shared-b.py'] },
        { number: 5, targetFiles: ['src/standalone.py'] },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clean).toBe(false);
      // Two clusters: {1,2} and {3,4}, issue 5 is standalone
      expect(result.data.clusters).toHaveLength(2);

      const clusterIssues = result.data.clusters.map((c) => c.issues);
      expect(clusterIssues).toContainEqual([1, 2]);
      expect(clusterIssues).toContainEqual([3, 4]);
    }
  });

  test('transitively clusters via shared files', () => {
    // Issue 1 shares file-a with Issue 2
    // Issue 2 shares file-b with Issue 3
    // All three should be in one cluster via transitive union
    const result = handler.execute({
      issues: [
        { number: 1, targetFiles: ['file-a.py'] },
        { number: 2, targetFiles: ['file-a.py', 'file-b.py'] },
        { number: 3, targetFiles: ['file-b.py'] },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clusters).toHaveLength(1);
      expect(result.data.clusters[0].issues).toEqual([1, 2, 3]);
    }
  });

  test('handles single issue (no overlaps possible)', () => {
    const result = handler.execute({
      issues: [{ number: 1, targetFiles: ['src/client.py'] }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clean).toBe(true);
    }
  });
});
