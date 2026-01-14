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
 * Projection Engine for Jules Query Language
 *
 * Supports:
 * - Dot notation field paths: "plan.steps.title"
 * - Wildcard inclusion: "*"
 * - Exclusion prefix: "-artifacts.data"
 * - Implicit array traversal: "artifacts.type" works on arrays
 */

/**
 * Parsed select expression
 */
export interface SelectExpression {
  path: string[];
  exclude: boolean;
  wildcard: boolean;
}

/**
 * Parse a select expression string into structured form
 *
 * Examples:
 * - "id" → { path: ["id"], exclude: false, wildcard: false }
 * - "plan.steps.title" → { path: ["plan", "steps", "title"], exclude: false, wildcard: false }
 * - "-artifacts.data" → { path: ["artifacts", "data"], exclude: true, wildcard: false }
 * - "*" → { path: [], exclude: false, wildcard: true }
 */
export function parseSelectExpression(expr: string): SelectExpression {
  if (expr === '*') {
    return { path: [], exclude: false, wildcard: true };
  }

  const exclude = expr.startsWith('-');
  const pathStr = exclude ? expr.slice(1) : expr;

  // Remove optional array markers like "[]" - they're implicit
  const cleanPath = pathStr.replace(/\[\]/g, '');
  const path = cleanPath.split('.').filter((p) => p.length > 0);

  return { path, exclude, wildcard: false };
}

/**
 * Get a value at a nested path, handling arrays transparently
 *
 * For paths that traverse arrays, returns an array of values from each element.
 *
 * Examples:
 * - getPath({a: {b: 1}}, ["a", "b"]) → 1
 * - getPath({items: [{x: 1}, {x: 2}]}, ["items", "x"]) → [1, 2]
 */
export function getPath(obj: unknown, path: string[]): unknown {
  if (path.length === 0) return obj;
  if (obj === null || obj === undefined) return undefined;

  const [head, ...tail] = path;

  if (Array.isArray(obj)) {
    // Map over array elements and collect values
    const results = obj
      .map((item) => getPath(item, path))
      .filter((v) => v !== undefined);
    return results.length > 0 ? results : undefined;
  }

  if (typeof obj === 'object') {
    const value = (obj as Record<string, unknown>)[head];
    return getPath(value, tail);
  }

  return undefined;
}

/**
 * Set a value at a nested path, creating intermediate objects as needed
 *
 * For array paths, preserves array structure.
 */
export function setPath(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): void {
  if (path.length === 0 || value === undefined) return;

  const [head, ...tail] = path;

  if (tail.length === 0) {
    obj[head] = value;
    return;
  }

  if (!(head in obj)) {
    obj[head] = {};
  }

  const next = obj[head];
  if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
    setPath(next as Record<string, unknown>, tail, value);
  }
}

/**
 * Delete a value at a nested path
 *
 * For paths ending in array elements, removes the field from each element.
 */
export function deletePath(obj: unknown, path: string[]): void {
  if (path.length === 0 || obj === null || obj === undefined) return;

  if (Array.isArray(obj)) {
    obj.forEach((item) => deletePath(item, path));
    return;
  }

  if (typeof obj !== 'object') return;

  const record = obj as Record<string, unknown>;
  const [head, ...tail] = path;

  if (tail.length === 0) {
    delete record[head];
    return;
  }

  if (head in record) {
    deletePath(record[head], tail);
  }
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => deepClone(item)) as T;

  const cloned: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    cloned[key] = deepClone((obj as Record<string, unknown>)[key]);
  }
  return cloned as T;
}

/**
 * Project an array value based on sub-paths
 *
 * Given an array and paths that start with common prefix,
 * project each element to include only the specified sub-fields.
 */
function projectArray(
  arr: unknown[],
  subPaths: string[][],
  excludePaths: string[][],
): unknown[] {
  return arr.map((item) => {
    if (item === null || typeof item !== 'object') return item;

    const projected: Record<string, unknown> = {};

    for (const subPath of subPaths) {
      const value = getPath(item, subPath);
      if (value !== undefined) {
        if (subPath.length === 0) {
          // Include all fields from this item
          Object.assign(projected, deepClone(item));
        } else {
          setPath(projected, subPath, deepClone(value));
        }
      }
    }

    // Apply exclusions
    for (const excludePath of excludePaths) {
      deletePath(projected, excludePath);
    }

    return projected;
  });
}

/**
 * Project a document according to select expressions
 *
 * @param doc The source document
 * @param selects Array of select expression strings
 * @returns Projected document with only selected fields
 */
export function projectDocument(
  doc: Record<string, unknown>,
  selects: string[],
): Record<string, unknown> {
  if (!selects || selects.length === 0) {
    // No selection = return as-is (default projection handled elsewhere)
    return doc;
  }

  const parsed = selects.map(parseSelectExpression);
  const hasWildcard = parsed.some((p) => p.wildcard && !p.exclude);
  const inclusions = parsed.filter((p) => !p.exclude && !p.wildcard);
  const exclusions = parsed.filter((p) => p.exclude);

  let result: Record<string, unknown>;

  if (hasWildcard) {
    // Start with full clone, then apply exclusions
    result = deepClone(doc);
  } else {
    // Start with empty, add inclusions
    result = {};

    // Group inclusions by top-level field for efficient array handling
    const byTopLevel = new Map<string, string[][]>();

    for (const incl of inclusions) {
      if (incl.path.length === 0) continue;
      const top = incl.path[0];
      if (!byTopLevel.has(top)) {
        byTopLevel.set(top, []);
      }
      byTopLevel.get(top)!.push(incl.path.slice(1));
    }

    for (const [topField, subPaths] of byTopLevel) {
      const value = doc[topField];
      if (value === undefined) continue;

      if (Array.isArray(value)) {
        // Handle array projection
        const exclusionSubPaths = exclusions
          .filter((e) => e.path[0] === topField)
          .map((e) => e.path.slice(1));

        if (subPaths.some((p) => p.length === 0)) {
          // Include full array (possibly with exclusions)
          result[topField] = projectArray(value, [[]], exclusionSubPaths);
        } else {
          // Project specific sub-fields from array elements
          result[topField] = projectArray(value, subPaths, exclusionSubPaths);
        }
      } else if (typeof value === 'object' && value !== null) {
        // Handle nested object
        if (subPaths.some((p) => p.length === 0)) {
          // Include full object
          result[topField] = deepClone(value);
        } else {
          // Recursively project nested fields
          const nestedSelects = subPaths.map((p) => p.join('.'));
          result[topField] = projectDocument(
            value as Record<string, unknown>,
            nestedSelects,
          );
        }
      } else {
        // Primitive value
        result[topField] = value;
      }
    }
  }

  // Apply exclusions
  for (const excl of exclusions) {
    deletePath(result, excl.path);
  }

  return result;
}

/**
 * Check if a path is a prefix of another path
 */
export function isPathPrefix(prefix: string[], path: string[]): boolean {
  if (prefix.length > path.length) return false;
  return prefix.every((p, i) => p === path[i]);
}
