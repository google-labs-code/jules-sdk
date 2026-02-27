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
import { UnionFind } from '../shared/union-find.js';

describe('UnionFind', () => {
  test('isolated elements form singleton groups', () => {
    const uf = new UnionFind<number>();
    uf.makeSet(1);
    uf.makeSet(2);
    uf.makeSet(3);

    const groups = uf.groups();
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.sort())).toContainEqual([1]);
    expect(groups.map((g) => g.sort())).toContainEqual([2]);
    expect(groups.map((g) => g.sort())).toContainEqual([3]);
  });

  test('union merges two elements into one group', () => {
    const uf = new UnionFind<number>();
    uf.makeSet(1);
    uf.makeSet(2);
    uf.union(1, 2);

    expect(uf.find(1)).toBe(uf.find(2));
    const groups = uf.groups();
    expect(groups).toHaveLength(1);
  });

  test('transitive union chains correctly', () => {
    const uf = new UnionFind<number>();
    uf.makeSet(1);
    uf.makeSet(2);
    uf.makeSet(3);
    uf.union(1, 2);
    uf.union(2, 3);

    expect(uf.find(1)).toBe(uf.find(3));
    const groups = uf.groups();
    expect(groups).toHaveLength(1);
  });

  test('separate groups remain separate', () => {
    const uf = new UnionFind<number>();
    uf.makeSet(1);
    uf.makeSet(2);
    uf.makeSet(3);
    uf.makeSet(4);
    uf.union(1, 2);
    uf.union(3, 4);

    expect(uf.find(1)).toBe(uf.find(2));
    expect(uf.find(3)).toBe(uf.find(4));
    expect(uf.find(1)).not.toBe(uf.find(3));

    const groups = uf.groups();
    expect(groups).toHaveLength(2);
  });

  test('union of same element is a no-op', () => {
    const uf = new UnionFind<number>();
    uf.makeSet(1);
    uf.union(1, 1);

    expect(uf.find(1)).toBe(1);
    const groups = uf.groups();
    expect(groups).toHaveLength(1);
  });

  test('find auto-creates set for unknown elements', () => {
    const uf = new UnionFind<number>();
    const root = uf.find(42);
    expect(root).toBe(42);
  });

  test('works with string type parameter', () => {
    const uf = new UnionFind<string>();
    uf.makeSet('a');
    uf.makeSet('b');
    uf.union('a', 'b');

    expect(uf.find('a')).toBe(uf.find('b'));
  });
});
