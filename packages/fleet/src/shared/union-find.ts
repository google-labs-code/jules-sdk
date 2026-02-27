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

/**
 * Generic Union-Find (Disjoint Set Union) data structure.
 *
 * Used by overlap detection to cluster issues that share files,
 * and potentially reusable for any grouping/partitioning problem.
 *
 * Implements path compression and union by rank for near-O(1) amortized operations.
 */
export class UnionFind<T extends number | string = number> {
  private parent = new Map<T, T>();
  private rank = new Map<T, number>();

  makeSet(x: T): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: T): T {
    const p = this.parent.get(x);
    if (p === undefined) {
      this.makeSet(x);
      return x;
    }
    if (p !== x) {
      const root = this.find(p);
      this.parent.set(x, root); // path compression
      return root;
    }
    return x;
  }

  union(a: T, b: T): void {
    const rootA = this.find(a);
    const rootB = this.find(b);

    if (rootA === rootB) return;

    const rankA = this.rank.get(rootA)!;
    const rankB = this.rank.get(rootB)!;

    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }

  /** Group all elements by their root, return arrays of elements in each group */
  groups(): T[][] {
    const grouped = new Map<T, T[]>();
    for (const x of this.parent.keys()) {
      const root = this.find(x);
      if (!grouped.has(root)) {
        grouped.set(root, []);
      }
      grouped.get(root)!.push(x);
    }
    return [...grouped.values()];
  }
}
