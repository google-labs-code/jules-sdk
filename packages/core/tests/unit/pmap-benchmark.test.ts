/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect } from 'vitest';
import { pMap } from '../../src/utils.js';

describe('pMap Benchmark & Correctness Tests', () => {
  it('should handle empty inputs instantly without overhead', async () => {
    const start = performance.now();
    const result = await pMap([], async (x) => x);
    const end = performance.now();

    expect(result).toEqual([]);
    // Checking < 50ms to be robust against thread preemption/jitter in CI environments
    expect(end - start).toBeLessThan(50);
  });

  it('should handle single-item inputs efficiently', async () => {
    const start = performance.now();
    const result = await pMap([42], async (x) => x * 2);
    const end = performance.now();

    expect(result).toEqual([84]);
    // Checking < 100ms to prevent flakiness in slow virtualized environments
    expect(end - start).toBeLessThan(100);
  });

  it('should run high concurrency benchmark', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const start = performance.now();
    const result = await pMap(
      items,
      async (x) => {
        return x + 1;
      },
      { concurrency: 50 },
    );
    const end = performance.now();

    expect(result).toHaveLength(1000);
    expect(result[0]).toBe(1);
    expect(result[999]).toBe(1000);

    console.log(
      `pMap benchmark for 1000 items (concurrency: 50) took: ${end - start}ms`,
    );
  });
});
