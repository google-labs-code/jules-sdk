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

import {
  JulesClient,
  JulesQuery,
  JulesDomain,
  QueryResult,
  FilterOp,
  WhereClause,
  SelectOptions,
  Activity,
} from '../types.js';
import { pMap } from '../utils.js';
import { projectDocument, getPath } from './projection.js';
import {
  injectActivityComputedFields,
  injectSessionComputedFields,
  DEFAULT_ACTIVITY_PROJECTION,
  DEFAULT_SESSION_PROJECTION,
} from './computed.js';
import { validateQuery } from './validate.js';

interface CompiledFilterOp {
  hasOperators: boolean;
  exists?: boolean;
  eq?: any;
  neq?: any;
  containsLower?: string;
  gt?: any;
  lt?: any;
  gte?: any;
  lte?: any;
  inSet?: Set<any>;
  directValue?: any;
}

interface CompiledFieldFilter {
  key: string;
  isDot: boolean;
  pathParts: string[];
  compiledOp: CompiledFilterOp;
}

/**
 * Compiles a FilterOp into a highly optimized structured representation
 * to avoid repeated object/array/string operations.
 */
function compileFilterOp(filter: any): CompiledFilterOp {
  if (filter === undefined) {
    return { hasOperators: false };
  }
  if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) {
    return { hasOperators: false, directValue: filter };
  }

  const op = filter as {
    eq?: any;
    neq?: any;
    contains?: string;
    gt?: any;
    lt?: any;
    gte?: any;
    lte?: any;
    in?: any[];
    exists?: boolean;
  };

  return {
    hasOperators: true,
    exists: op.exists,
    eq: op.eq,
    neq: op.neq,
    containsLower:
      typeof op.contains === 'string' ? op.contains.toLowerCase() : undefined,
    gt: op.gt,
    lt: op.lt,
    gte: op.gte,
    lte: op.lte,
    inSet: Array.isArray(op.in) ? new Set(op.in) : undefined,
  };
}

/**
 * Compiles a full where-clause record into an array of structured field filters,
 * optionally filtering only dot notation keys or excluding a specific key.
 */
function compileWhere(
  where?: Record<string, FilterOp<unknown>>,
  onlyDot = false,
  excludeKey?: string,
): CompiledFieldFilter[] {
  if (!where) return [];
  const compiled: CompiledFieldFilter[] = [];
  for (const key in where) {
    if (Object.prototype.hasOwnProperty.call(where, key)) {
      if (excludeKey && key === excludeKey) continue;
      const isDot = key.includes('.');
      if (onlyDot && !isDot) continue;
      const filter = where[key];
      const pathParts = isDot ? key.split('.') : [key];
      compiled.push({
        key,
        isDot,
        pathParts,
        compiledOp: compileFilterOp(filter),
      });
    }
  }
  return compiled;
}

/**
 * Matches an actual value against a pre-compiled FilterOp.
 */
function matchCompiled(actual: any, op: CompiledFilterOp): boolean {
  if (!op.hasOperators) {
    if (op.directValue !== undefined) {
      return actual === op.directValue;
    }
    return true;
  }

  if (op.exists !== undefined) {
    const valueExists = actual !== undefined && actual !== null;
    return op.exists ? valueExists : !valueExists;
  }

  if (op.eq !== undefined && actual !== op.eq) return false;
  if (op.neq !== undefined && actual === op.neq) return false;
  if (
    op.containsLower !== undefined &&
    typeof actual === 'string' &&
    !actual.toLowerCase().includes(op.containsLower)
  )
    return false;
  if (op.gt !== undefined && op.gt !== null && actual <= op.gt) return false;
  if (op.gte !== undefined && op.gte !== null && actual < op.gte) return false;
  if (op.lt !== undefined && op.lt !== null && actual >= op.lt) return false;
  if (op.lte !== undefined && op.lte !== null && actual > op.lte) return false;
  if (op.inSet !== undefined && !op.inSet.has(actual)) return false;

  return true;
}

/**
 * Matches a document against an array of pre-compiled field filters.
 * Replaces Object.entries, recursion, path splits, and .some() closures
 * with highly performant, non-allocating native loops.
 */
function matchWhereCompiled(
  doc: unknown,
  compiledFilters: CompiledFieldFilter[],
): boolean {
  const len = compiledFilters.length;
  for (let i = 0; i < len; i++) {
    const f = compiledFilters[i];
    if (f.isDot) {
      const value = getPath(doc, f.pathParts);
      if (Array.isArray(value)) {
        let anyMatches = false;
        const valLen = value.length;
        for (let j = 0; j < valLen; j++) {
          if (matchCompiled(value[j], f.compiledOp)) {
            anyMatches = true;
            break;
          }
        }
        if (!anyMatches) return false;
      } else {
        if (!matchCompiled(value, f.compiledOp)) return false;
      }
    } else {
      const value = (doc as Record<string, unknown>)[f.key];
      if (!matchCompiled(value, f.compiledOp)) return false;
    }
  }
  return true;
}

/**
 * Matches a value against a FilterOp (legacy fallback).
 */
function match<V>(actual: V, filter?: FilterOp<V>): boolean {
  return matchCompiled(actual, compileFilterOp(filter));
}

/**
 * Match a document against a full where clause (legacy fallback).
 */
function matchWhere(
  doc: unknown,
  where?: Record<string, FilterOp<unknown>>,
): boolean {
  return matchWhereCompiled(doc, compileWhere(where));
}

/**
 * Helper to convert WhereClause<'activities'> to SelectOptions.
 * Note: ActivityClient.select currently takes a simpler SelectOptions object.
 * We'll map what we can.
 */
function toActivitySelectOptions(
  where?: WhereClause<'activities'>,
): SelectOptions {
  if (!where) return {};
  const options: SelectOptions = {};

  // Simple mapping for 'type' if it's an equality check
  if (where.type) {
    if (typeof where.type === 'string') {
      options.type = where.type;
    } else if (
      typeof where.type === 'object' &&
      'eq' in where.type &&
      where.type.eq
    ) {
      options.type = where.type.eq;
    }
  }

  return options;
}

/**
 * Apply projection to a document, handling computed fields
 */
function applyProjection(
  doc: unknown,
  select: string[] | undefined,
  domain: 'sessions' | 'activities',
): Record<string, unknown> {
  const docRecord = doc as Record<string, unknown>;

  // Performance Optimization: If no custom select fields are specified, we default to the standard projection list.
  // Passing the resolved projection list to the computed fields injector allows bypassing expensive object cloning
  // and CPU date-parsing operations for computed fields (like durationMs) that are not part of the default projection.
  const selectFields =
    select ??
    (domain === 'activities'
      ? DEFAULT_ACTIVITY_PROJECTION
      : DEFAULT_SESSION_PROJECTION);

  // Inject computed fields first using the target projection list
  const withComputed =
    domain === 'activities'
      ? injectActivityComputedFields(doc as Activity, selectFields)
      : injectSessionComputedFields(docRecord, selectFields);

  // If no select specified, use default projection
  if (!select) {
    return projectDocument(
      withComputed as Record<string, unknown>,
      selectFields,
    );
  }

  // If empty array or contains only '*', return all with computed
  if (select.length === 0 || (select.length === 1 && select[0] === '*')) {
    // If withComputed is identical to doc (meaning no new computed fields were injected),
    // shallow copy to avoid mutating the cached object while bypassing deep projection overhead.
    if (withComputed === docRecord) {
      return { ...docRecord };
    }
    return withComputed as Record<string, unknown>;
  }

  // Apply projection engine
  return projectDocument(withComputed as Record<string, unknown>, select);
}

/**
 * Standalone query engine function.
 * Handles planning, index scanning, and hydration.
 */
export async function select<T extends JulesDomain>(
  client: JulesClient,
  query: JulesQuery<T>,
): Promise<QueryResult<T>[]> {
  const validationResult = validateQuery(query);
  if (!validationResult.valid) {
    const messages = validationResult.errors
      .map((e) => `[${e.code}] ${e.path}: ${e.message}`)
      .join('; ');
    throw new Error(`INVALID_QUERY: ${messages}`);
  }

  const storage = client.storage;
  const results: Record<string, unknown>[] = [];
  const limit = query.limit ?? Infinity;

  if (query.from === 'sessions') {
    const where = query.where as WhereClause<'sessions'> | undefined;

    const whereRecord = where as Record<string, FilterOp<unknown>> | undefined;
    const compiledDotWhere = compileWhere(whereRecord, true);

    let chunk: any[] = [];
    const CHUNK_SIZE = 50;

    const processChunk = async () => {
      if (chunk.length === 0) return;

      // PASS 2: Hydration (Heavy Data) - Parallelized
      // Concurrency boosted from 10 to 25 to maximize throughput for disk/network reads
      const hydrated = await pMap(
        chunk,
        async (entry) => {
          const cached = await storage.get(entry.id);
          return { entry, cached };
        },
        { concurrency: 25 },
      );

      for (const { cached } of hydrated) {
        if (results.length >= limit) break;
        if (!cached) continue;

        if (
          compiledDotWhere.length > 0 &&
          !matchWhereCompiled(cached.resource, compiledDotWhere)
        )
          continue;

        const item = applyProjection(
          cached.resource,
          query.select as string[] | undefined,
          'sessions',
        );

        // Preserve sorting metadata from original document.
        // Pre-parse the Date string to an O(1) number to avoid costly allocations during sorting.
        const resourceRecord = cached.resource as unknown as Record<
          string,
          unknown
        >;
        const createTimeStr = (resourceRecord.createTime ??
          item.createTime ??
          '') as string;
        item._sortKey = {
          createTime: resourceRecord.createTime,
          time: createTimeStr ? Date.parse(createTimeStr) : 0,
          id: resourceRecord.id ?? item.id,
        };

        results.push(item);
      }
      chunk = [];
    };

    // Pre-calculate lower-case search query outside of the loop to avoid redundant conversions
    const searchLower =
      typeof where?.search === 'string'
        ? (where.search as string).toLowerCase()
        : undefined;

    const compiledIdFilter = where?.id ? compileFilterOp(where.id) : undefined;
    const compiledStateFilter = where?.state
      ? compileFilterOp(where.state)
      : undefined;
    const compiledTitleFilter = where?.title
      ? compileFilterOp(where.title)
      : undefined;

    // PASS 1: Index Scan (Metadata Only)
    for await (const entry of storage.scanIndex()) {
      if (results.length >= limit) break;

      // Filter by ID
      if (compiledIdFilter && !matchCompiled(entry.id, compiledIdFilter))
        continue;
      // Filter by State
      if (
        compiledStateFilter &&
        !matchCompiled(entry.state, compiledStateFilter)
      )
        continue;
      // Filter by Title (Fuzzy Search or specific title)
      if (
        compiledTitleFilter &&
        !matchCompiled(entry.title, compiledTitleFilter)
      )
        continue;
      // Global Search
      if (searchLower && !entry.title.toLowerCase().includes(searchLower))
        continue;

      chunk.push(entry);

      // Process chunk if it reaches CHUNK_SIZE or if we have enough items for the limit without dot filters
      if (
        chunk.length >= CHUNK_SIZE ||
        (compiledDotWhere.length === 0 &&
          chunk.length >= limit - results.length)
      ) {
        await processChunk();
      }
    }

    // Process any remaining items
    await processChunk();

    // PASS 3: Virtual Join (Include Activities)
    if (query.include && 'activities' in query.include) {
      const actConfig = query.include.activities;
      let mappedOptions: SelectOptions & { limit?: number } = {};
      if (typeof actConfig === 'object') {
        mappedOptions = {
          ...toActivitySelectOptions(actConfig.where),
          limit: actConfig.limit,
        };
      }

      await pMap(
        results,
        async (session) => {
          const sessionClient = await client.session(session.id as string);
          const localActivities = await sessionClient.activities.select({});
          const activities: Record<string, unknown>[] = [];
          for (const act of localActivities) {
            if (
              mappedOptions.limit &&
              activities.length >= mappedOptions.limit
            ) {
              break;
            }
            if (mappedOptions.type && act.type !== mappedOptions.type) {
              continue;
            }
            activities.push(act as unknown as Record<string, unknown>);
          }
          session.activities = activities;
        },
        { concurrency: 5 },
      );
    }
  } else if (query.from === 'activities') {
    const where = query.where as Record<string, FilterOp<unknown>> | undefined;

    // Optimization: Target specific session if ID is provided
    let targetSessionIds: string[] = [];

    if (where?.sessionId) {
      if (typeof where.sessionId === 'string') {
        targetSessionIds = [where.sessionId];
      } else if (
        typeof where.sessionId === 'object' &&
        'eq' in where.sessionId &&
        where.sessionId.eq
      ) {
        targetSessionIds = [where.sessionId.eq as string];
      }
    }

    // Use a session cache to avoid N+1 fetches for session info
    const sessionCache = new Map<string, Record<string, unknown>>();

    // Generator for session IDs to scan
    const sessionScanner = async function* () {
      if (targetSessionIds.length > 0) {
        for (const id of targetSessionIds) {
          yield { id };
        }
      } else {
        yield* storage.scanIndex();
      }
    };

    // PASS 1: Scatter-Gather (Cross-session activity search)
    // Convert AsyncIterable to an Array so we can pass it to pMap.
    // pMap handles concurrency over the array.
    const sessionEntries: { id: string }[] = [];
    for await (const sessionEntry of sessionScanner()) {
      sessionEntries.push(sessionEntry);
    }

    // Optimization: Map query filters (such as type, limits, cursors) down to the storage selection.
    // This avoids fetching, parsing, and hydrating every activity in the session.
    const selectOptions = toActivitySelectOptions(
      query.where as WhereClause<'activities'>,
    );

    // If sorting order is ascending, we can safely apply startAfter and limit to storage scan.
    if (query.order === 'asc') {
      if (query.startAfter) {
        selectOptions.after = query.startAfter;
      }
      if (query.limit !== undefined) {
        selectOptions.limit = query.limit;
      }
    }

    // Optimization: Pre-compile filters outside of the loop to avoid redundant operations and GC overhead.
    const compiledActivityWhere = compileWhere(where, false, 'sessionId');
    const compiledActIdFilter = where?.id
      ? compileFilterOp(where.id)
      : undefined;
    const compiledActTypeFilter = where?.type
      ? compileFilterOp(where.type)
      : undefined;

    const sessionResults = await pMap(
      sessionEntries,
      async (sessionEntry) => {
        const sessionClient = await client.session(sessionEntry.id);
        const localActivities =
          await sessionClient.activities.select(selectOptions);
        const filtered: Record<string, unknown>[] = [];

        for (const act of localActivities) {
          // Apply standard filters
          if (
            compiledActIdFilter &&
            !matchCompiled(act.id, compiledActIdFilter)
          )
            continue;
          if (
            compiledActTypeFilter &&
            !matchCompiled(act.type, compiledActTypeFilter)
          )
            continue;

          // Apply dot-notation filters with existential matching
          // Exclude sessionId from activity-level matching since it's handled by session routing
          if (
            compiledActivityWhere.length > 0 &&
            !matchWhereCompiled(act, compiledActivityWhere)
          )
            continue;

          const item = applyProjection(
            act,
            query.select as string[] | undefined,
            'activities',
          );

          // Preserve sorting metadata from original document.
          // Pre-parse the Date string to an O(1) number to avoid costly allocations during sorting.
          const actRecord = act as unknown as Record<string, unknown>;
          const createTimeStr = (actRecord.createTime ??
            item.createTime ??
            '') as string;
          item._sortKey = {
            createTime: actRecord.createTime,
            time: createTimeStr ? Date.parse(createTimeStr) : 0,
            id: actRecord.id ?? item.id,
          };

          // PASS 2: Reverse Join (Include Session Metadata)
          if (query.include && 'session' in query.include) {
            const sessConfig = query.include.session;
            const sessSelect =
              typeof sessConfig === 'object' ? sessConfig.select : undefined;

            let sessionInfo = sessionCache.get(sessionEntry.id);
            if (!sessionInfo) {
              const info = await sessionClient.info();
              sessionInfo = info as unknown as Record<string, unknown>;
              sessionCache.set(sessionEntry.id, sessionInfo);
            }

            item.session = applyProjection(
              sessionInfo,
              sessSelect as string[] | undefined,
              'sessions',
            );
          }

          filtered.push(item);
        }
        return filtered;
      },
      { concurrency: 5 },
    );

    for (const res of sessionResults) {
      results.push(...res);
    }
  }

  // Sorting - use precomputed time/id inside _sortKey if available, fallback to document fields
  const order = query.order ?? 'desc';
  results.sort((a, b) => {
    const sortKeyA = a._sortKey as
      | { createTime?: string; time: number; id: string }
      | undefined;
    const sortKeyB = b._sortKey as
      | { createTime?: string; time: number; id: string }
      | undefined;

    // In case _sortKey is missing (fallback), parse Date on the fly
    const timeA = sortKeyA
      ? sortKeyA.time
      : a.createTime
        ? Date.parse(a.createTime as string)
        : 0;
    const timeB = sortKeyB
      ? sortKeyB.time
      : b.createTime
        ? Date.parse(b.createTime as string)
        : 0;

    const idA = (sortKeyA?.id ?? a.id) as string;
    const idB = (sortKeyB?.id ?? b.id) as string;
    if (timeA !== timeB) {
      return order === 'desc' ? timeB - timeA : timeA - timeB;
    }
    if (order === 'desc') {
      return idB < idA ? -1 : idB > idA ? 1 : 0;
    }
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });

  let finalResults = results;

  // Handle cursor pagination (before removing _sortKey so we can use the id)
  const cursorId = query.startAfter ?? query.startAt;
  if (cursorId) {
    const cursorIndex = finalResults.findIndex((item) => {
      const sortKey = item._sortKey as { id: string } | undefined;
      const itemId = sortKey?.id ?? item.id;
      return itemId === cursorId;
    });
    if (cursorIndex === -1) {
      return [];
    }
    const sliceIndex = query.startAfter ? cursorIndex + 1 : cursorIndex;
    finalResults = finalResults.slice(sliceIndex);
  }

  // Remove _sortKey from results
  for (const result of finalResults) {
    delete result._sortKey;
  }

  return finalResults.slice(0, limit) as unknown as QueryResult<T>[];
}
