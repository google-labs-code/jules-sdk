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

/**
 * The internal engine for jules.all()
 *
 * Highly optimized parallel mapping function with fast-paths.
 * - O(1) instant return for empty inputs (bypasses all worker allocation/Promise.all overhead).
 * - O(1) instant return for single-item inputs (bypasses worker allocation, array filling, Promise.all/loops).
 * - Capped concurrency pool Math.min(concurrency, items.length) to eliminate spawning redundant worker promises
 *   when concurrency is greater than the item count.
 *
 * @param items - Data to process
 * @param mapper - Async function (item) => result
 * @param options - Configuration options
 */
export async function pMap<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  options: {
    concurrency?: number;
    stopOnError?: boolean;
    delayMs?: number;
  } = {},
): Promise<R[]> {
  const itemsLen = items.length;

  // Optimization: Fast-path for empty inputs. Completely avoids array, promise, or timer allocations.
  if (itemsLen === 0) {
    return [];
  }

  const delayMs = options.delayMs ?? 0;
  const stopOnError = options.stopOnError ?? true;

  // Optimization: Fast-path for single-item inputs. Avoids worker pool construction,
  // key iterator state machine tracking, and intermediate array mapping allocations.
  if (itemsLen === 1) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      const res = await mapper(items[0], 0);
      return [res];
    } catch (err) {
      if (stopOnError) {
        throw err;
      }
      throw new AggregateError(
        [err],
        'Multiple errors occurred during jules.all()',
      );
    }
  }

  // Optimization: Limit active worker pool allocation to the minimum of concurrency or items length.
  // This avoids allocating redundant, immediately-resolving idle worker promises.
  const limit = options.concurrency ?? 3;
  const concurrency = limit < itemsLen ? limit : itemsLen;

  const results = new Array<R>(itemsLen);
  const errors = new Array<Error | unknown>();
  let nextIndex = 0;

  // Optimization: Construct worker promises using a native indexed loop rather than chaining
  // fill() and map() array allocation helpers, which completely avoids garbage collection churn.
  const workers = new Array(concurrency);
  for (let i = 0; i < concurrency; i++) {
    workers[i] = (async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= itemsLen) {
          break;
        }
        const item = items[index];

        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        try {
          results[index] = await mapper(item, index);
        } catch (err) {
          if (stopOnError) {
            throw err;
          }
          errors.push(err);
        }
      }
    })();
  }

  await Promise.all(workers);

  if (!stopOnError && errors.length > 0) {
    throw new AggregateError(
      errors,
      'Multiple errors occurred during jules.all()',
    );
  }

  return results;
}
