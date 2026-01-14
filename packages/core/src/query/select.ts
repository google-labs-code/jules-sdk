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

/**
 * Matches a value against a FilterOp.
 */
function match<V>(actual: V, filter?: FilterOp<V>): boolean {
  if (filter === undefined) return true;
  if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) {
    return actual === filter;
  }

  const op = filter as {
    eq?: V;
    neq?: V;
    contains?: string;
    gt?: V;
    lt?: V;
    gte?: V;
    lte?: V;
    in?: V[];
    exists?: boolean;
  };

  // Handle exists operator
  if (op.exists !== undefined) {
    const valueExists = actual !== undefined && actual !== null;
    return op.exists ? valueExists : !valueExists;
  }

  if (op.eq !== undefined && actual !== op.eq) return false;
  if (op.neq !== undefined && actual === op.neq) return false;
  if (
    op.contains !== undefined &&
    typeof actual === 'string' &&
    !actual.toLowerCase().includes(op.contains.toLowerCase())
  )
    return false;
  if (op.gt !== undefined && op.gt !== null && actual <= op.gt) return false;
  if (op.gte !== undefined && op.gte !== null && actual < op.gte) return false;
  if (op.lt !== undefined && op.lt !== null && actual >= op.lt) return false;
  if (op.lte !== undefined && op.lte !== null && actual > op.lte) return false;
  if (op.in !== undefined && !op.in.includes(actual)) return false;

  return true;
}

/**
 * Check if a where key uses dot notation (nested path)
 */
function isDotPath(key: string): boolean {
  return key.includes('.');
}

/**
 * Match a document against a filter using dot notation paths
 * Uses existential quantification for array paths
 */
function matchPath(
  doc: unknown,
  path: string,
  filter: FilterOp<unknown>,
): boolean {
  const pathParts = path.split('.');
  const value = getPath(doc, pathParts);

  // For arrays, use existential matching (ANY element matches)
  if (Array.isArray(value)) {
    return value.some((v) => match(v, filter));
  }

  return match(value, filter);
}

/**
 * Match a document against a full where clause with dot notation support
 */
function matchWhere(
  doc: unknown,
  where?: Record<string, FilterOp<unknown>>,
): boolean {
  if (!where) return true;

  for (const [key, filter] of Object.entries(where)) {
    if (isDotPath(key)) {
      // Use path-based matching
      if (!matchPath(doc, key, filter)) return false;
    } else {
      // Use direct field matching
      const value = (doc as Record<string, unknown>)[key];
      if (!match(value, filter)) return false;
    }
  }

  return true;
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

  // Inject computed fields first
  const withComputed =
    domain === 'activities'
      ? injectActivityComputedFields(doc as Activity, select)
      : injectSessionComputedFields(docRecord, select);

  // If no select specified, use default projection
  if (!select) {
    const defaults =
      domain === 'activities'
        ? DEFAULT_ACTIVITY_PROJECTION
        : DEFAULT_SESSION_PROJECTION;
    return projectDocument(withComputed as Record<string, unknown>, defaults);
  }

  // If empty array or contains only '*', return all with computed
  if (select.length === 0) {
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
  const storage = client.storage;
  const results: Record<string, unknown>[] = [];
  const limit = query.limit ?? Infinity;

  if (query.from === 'sessions') {
    const where = query.where as WhereClause<'sessions'> | undefined;

    // PASS 1: Index Scan (Metadata Only)
    for await (const entry of storage.scanIndex()) {
      if (results.length >= limit) break;

      // Filter by ID
      if (where?.id && !match(entry.id, where.id)) continue;
      // Filter by State
      if (where?.state && !match(entry.state, where.state)) continue;
      // Filter by Title (Fuzzy Search or specific title)
      if (where?.title && !match(entry.title, where.title)) continue;
      // Global Search
      if (
        where?.search &&
        !entry.title.toLowerCase().includes(where.search.toLowerCase())
      )
        continue;

      // PASS 2: Hydration (Heavy Data)
      const cached = await storage.get(entry.id);
      if (!cached) continue;

      // Check dot-notation filters against full document
      const whereRecord = where as
        | Record<string, FilterOp<unknown>>
        | undefined;
      const dotFilters = whereRecord
        ? Object.entries(whereRecord).filter(([k]) => isDotPath(k))
        : [];

      if (dotFilters.length > 0) {
        const dotWhere = Object.fromEntries(dotFilters);
        if (!matchWhere(cached.resource, dotWhere)) continue;
      }

      const item = applyProjection(
        cached.resource,
        query.select as string[] | undefined,
        'sessions',
      );

      // Preserve sorting metadata from original document
      const resourceRecord = cached.resource as unknown as Record<
        string,
        unknown
      >;
      item._sortKey = {
        createTime: resourceRecord.createTime,
        id: resourceRecord.id,
      };

      results.push(item);
    }

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
    for await (const sessionEntry of sessionScanner()) {
      const sessionClient = await client.session(sessionEntry.id);
      const localActivities = await sessionClient.activities.select({});

      for (const act of localActivities) {
        // Apply standard filters
        if (where?.id && !match(act.id, where.id)) continue;
        if (where?.type && !match(act.type, where.type)) continue;

        // Apply dot-notation filters with existential matching
        // Exclude sessionId from activity-level matching since it's handled by session routing
        const activityWhere = where
          ? Object.fromEntries(
              Object.entries(where).filter(([k]) => k !== 'sessionId'),
            )
          : undefined;
        if (!matchWhere(act, activityWhere)) continue;

        const item = applyProjection(
          act,
          query.select as string[] | undefined,
          'activities',
        );

        // Preserve sorting metadata from original document
        const actRecord = act as unknown as Record<string, unknown>;
        item._sortKey = {
          createTime: actRecord.createTime,
          id: actRecord.id,
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

        results.push(item);
      }
    }
  }

  // Sorting - use _sortKey if available, fallback to document fields
  const order = query.order ?? 'desc';
  results.sort((a, b) => {
    const sortKeyA = a._sortKey as
      | { createTime: string; id: string }
      | undefined;
    const sortKeyB = b._sortKey as
      | { createTime: string; id: string }
      | undefined;
    const timeA = new Date(
      (sortKeyA?.createTime ?? a.createTime) as string,
    ).getTime();
    const timeB = new Date(
      (sortKeyB?.createTime ?? b.createTime) as string,
    ).getTime();
    const idA = (sortKeyA?.id ?? a.id) as string;
    const idB = (sortKeyB?.id ?? b.id) as string;
    if (timeA !== timeB) {
      return order === 'desc' ? timeB - timeA : timeA - timeB;
    }
    if (order === 'desc') {
      return idB.localeCompare(idA);
    }
    return idA.localeCompare(idB);
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
