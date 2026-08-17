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

const selectExpressionCache = new Map<string, SelectExpression>();

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
  const cached = selectExpressionCache.get(expr);
  if (cached) {
    return cached;
  }

  let result: SelectExpression;
  if (expr === '*') {
    result = { path: [], exclude: false, wildcard: true };
  } else {
    const exclude = expr.startsWith('-');
    const pathStr = exclude ? expr.slice(1) : expr;

    // Remove optional array markers like "[]" - they're implicit
    const cleanPath = pathStr.replace(/\[\]/g, '');
    const path = cleanPath.split('.').filter((p) => p.length > 0);

    result = { path, exclude, wildcard: false };
  }

  selectExpressionCache.set(expr, result);
  return result;
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
export function getPath(obj: unknown, path: string[], index = 0): unknown {
  if (index >= path.length) return obj;
  if (obj === null || obj === undefined) return undefined;

  const head = path[index];

  if (Array.isArray(obj)) {
    // Map over array elements and collect values using a standard indexed loop
    // to avoid closure creation and array allocations from map/filter.
    const results: unknown[] = [];
    const len = obj.length;
    for (let i = 0; i < len; i++) {
      const v = getPath(obj[i], path, index);
      if (v !== undefined) {
        results.push(v);
      }
    }
    return results.length > 0 ? results : undefined;
  }

  if (typeof obj === 'object') {
    const value = (obj as Record<string, unknown>)[head];
    return getPath(value, path, index + 1);
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
  index = 0,
): void {
  if (index >= path.length || value === undefined) return;

  const head = path[index];

  if (index === path.length - 1) {
    obj[head] = value;
    return;
  }

  if (!(head in obj)) {
    obj[head] = {};
  }

  const next = obj[head];
  if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
    setPath(next as Record<string, unknown>, path, value, index + 1);
  }
}

/**
 * Delete a value at a nested path
 *
 * For paths ending in array elements, removes the field from each element.
 */
export function deletePath(obj: unknown, path: string[], index = 0): void {
  if (index >= path.length || obj === null || obj === undefined) return;

  if (Array.isArray(obj)) {
    const len = obj.length;
    for (let i = 0; i < len; i++) {
      deletePath(obj[i], path, index);
    }
    return;
  }

  if (typeof obj !== 'object') return;

  const record = obj as Record<string, unknown>;
  const head = path[index];

  if (index === path.length - 1) {
    delete record[head];
    return;
  }

  if (head in record) {
    deletePath(record[head], path, index + 1);
  }
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    const len = obj.length;
    const cloned = new Array(len);
    for (let i = 0; i < len; i++) {
      const val = obj[i];
      cloned[i] =
        val === null || typeof val !== 'object' ? val : deepClone(val);
    }
    return cloned as T;
  }

  const cloned: Record<string, unknown> = {};
  const keys = Object.keys(obj);
  const len = keys.length;
  for (let i = 0; i < len; i++) {
    const key = keys[i];
    const val = (obj as Record<string, unknown>)[key];
    cloned[key] =
      val === null || typeof val !== 'object' ? val : deepClone(val);
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
  const len = arr.length;
  const projectedArr = new Array(len);

  // Performance Optimization: If we have a single subpath which is empty (representing the entire element)
  // and no exclusions, we can bypass the entire property loop, nested path lookups, and allocation of intermediate empty objects.
  // Instead, we directly deep-clone the element, achieving a massive speedup on full element copies within arrays.
  const isWholeClone =
    excludePaths.length === 0 &&
    subPaths.length === 1 &&
    subPaths[0].length === 0;

  if (isWholeClone) {
    for (let i = 0; i < len; i++) {
      const item = arr[i];
      projectedArr[i] =
        item === null || typeof item !== 'object' ? item : deepClone(item);
    }
    return projectedArr;
  }

  for (let i = 0; i < len; i++) {
    const item = arr[i];
    if (item === null || typeof item !== 'object') {
      projectedArr[i] = item;
      continue;
    }

    const projected: Record<string, unknown> = {};

    const subPathsLen = subPaths.length;
    for (let j = 0; j < subPathsLen; j++) {
      const subPath = subPaths[j];
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
    const excludePathsLen = excludePaths.length;
    for (let j = 0; j < excludePathsLen; j++) {
      deletePath(projected, excludePaths[j]);
    }

    projectedArr[i] = projected;
  }

  return projectedArr;
}

/**
 * Project a document according to select expressions
 *
 * @param doc The source document
 * @param selects Array of select expression strings
 * @returns Projected document with only selected fields
 */
/**
 * Cached Projection Plan to avoid re-parsing select expressions,
 * re-filtering inclusions/exclusions, and rebuilding grouping maps
 * for every single document in a multi-document query.
 */
export interface ProjectionPlan {
  hasWildcard: boolean;
  byTopLevel: Map<string, string[][]>;
  exclusions: SelectExpression[];
  isSimpleTopLevel?: boolean;
  exclusionSubPathsByTopLevel: Map<string, string[][]>;
  nestedSelectsByTopLevel: Map<string, string[]>;
}

const projectionPlanCache = new Map<string, ProjectionPlan>();

/**
 * Get or compile a projection plan for a given list of select expressions.
 * This yields an O(1) cache lookup after the first projected document.
 */
export function getProjectionPlan(selects: string[]): ProjectionPlan {
  const cacheKey = selects.join(',');
  let plan = projectionPlanCache.get(cacheKey);
  if (!plan) {
    const parsed = selects.map(parseSelectExpression);
    const hasWildcard = parsed.some((p) => p.wildcard && !p.exclude);
    const inclusions = parsed.filter((p) => !p.exclude && !p.wildcard);
    const exclusions = parsed.filter((p) => p.exclude);

    // Fast-path detection: Check if the projection consists entirely of
    // simple top-level fields with no wildcards and no exclusions.
    const isSimpleTopLevel =
      !hasWildcard &&
      exclusions.length === 0 &&
      inclusions.every((incl) => incl.path.length === 1);

    const byTopLevel = new Map<string, string[][]>();
    for (const incl of inclusions) {
      if (incl.path.length === 0) continue;
      const top = incl.path[0];
      let subPaths = byTopLevel.get(top);
      if (!subPaths) {
        subPaths = [];
        byTopLevel.set(top, subPaths);
      }
      subPaths.push(incl.path.slice(1));
    }

    // Pre-compile and cache exclusion sub-paths and nested selects per top-level field
    // to bypass costly array mappings and string manipulations during runtime scans.
    const exclusionSubPathsByTopLevel = new Map<string, string[][]>();
    const exclusionsLen = exclusions.length;
    for (let i = 0; i < exclusionsLen; i++) {
      const excl = exclusions[i];
      if (excl.path.length === 0) continue;
      const top = excl.path[0];
      let subPaths = exclusionSubPathsByTopLevel.get(top);
      if (!subPaths) {
        subPaths = [];
        exclusionSubPathsByTopLevel.set(top, subPaths);
      }
      subPaths.push(excl.path.slice(1));
    }

    const nestedSelectsByTopLevel = new Map<string, string[]>();
    for (const [topField, subPaths] of byTopLevel) {
      const nestedLen = subPaths.length;
      const nested = new Array(nestedLen);
      for (let i = 0; i < nestedLen; i++) {
        nested[i] = subPaths[i].join('.');
      }
      nestedSelectsByTopLevel.set(topField, nested);
    }

    plan = {
      hasWildcard,
      byTopLevel,
      exclusions,
      isSimpleTopLevel,
      exclusionSubPathsByTopLevel,
      nestedSelectsByTopLevel,
    };
    projectionPlanCache.set(cacheKey, plan);
  }
  return plan;
}

export function projectDocument(
  doc: Record<string, unknown>,
  selects: string[],
): Record<string, unknown> {
  if (!selects || selects.length === 0) {
    // No selection = return as-is (default projection handled elsewhere)
    return doc;
  }

  // Use compiled projection plan to bypass redundant parsing/grouping
  const plan = getProjectionPlan(selects);
  const {
    hasWildcard,
    byTopLevel,
    exclusions,
    isSimpleTopLevel,
    exclusionSubPathsByTopLevel,
    nestedSelectsByTopLevel,
  } = plan;

  // Fast-path: Optimized top-level field selection.
  // Avoids sub-path checks, array and type detection, and recursive projection.
  // Directly clones objects/arrays and copies primitives by reference.
  if (isSimpleTopLevel) {
    const result: Record<string, unknown> = {};
    for (const topField of byTopLevel.keys()) {
      const value = doc[topField];
      if (value !== undefined) {
        result[topField] =
          value === null || typeof value !== 'object'
            ? value
            : deepClone(value);
      }
    }
    return result;
  }

  let result: Record<string, unknown>;

  if (hasWildcard) {
    // Start with full clone, then apply exclusions
    result = deepClone(doc);
  } else {
    // Start with empty, add inclusions
    result = {};

    for (const [topField, subPaths] of byTopLevel) {
      const value = doc[topField];
      if (value === undefined) continue;

      if (Array.isArray(value)) {
        // Handle array projection
        // Retrieve pre-compiled exclusion sub-paths to avoid allocating/mapping arrays inside the hot loop
        const exclusionSubPaths =
          exclusionSubPathsByTopLevel.get(topField) || [];

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
          // Retrieve pre-compiled nested selects to avoid map/join overhead in the hot loop
          const nestedSelects = nestedSelectsByTopLevel.get(topField) || [];
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
  const exclusionsLen = exclusions.length;
  for (let i = 0; i < exclusionsLen; i++) {
    deletePath(result, exclusions[i].path);
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
