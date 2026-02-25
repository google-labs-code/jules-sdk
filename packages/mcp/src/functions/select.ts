import type { JulesClient, JulesQuery, JulesDomain, Activity } from '@google/jules-sdk';
import type { SelectResult, SelectOptions } from './types.js';
import { truncateToTokenBudget } from '../tokenizer.js';
import { toLightweight } from '../lightweight.js';

/**
 * Query the local cache of sessions and activities.
 *
 * @param client - The Jules client instance
 * @param query - The JulesQuery object defining selection criteria
 * @param options - Optional settings like tokenBudget
 * @returns Query results with optional metadata about truncation
 */
export async function select<T = unknown>(
  client: JulesClient,
  query: JulesQuery<JulesDomain>,
  options: SelectOptions = {},
): Promise<SelectResult<T>> {
  if (!query) {
    throw new Error('Query argument is required');
  }

  const { tokenBudget } = options;
  let results: unknown[] = await client.select(query);
  let truncated = false;
  let tokenCount = 0;

  // Lightweight responses by default for activities, UNLESS user explicitly
  // selected artifact fields - in that case, respect their projection
  if (query.from === 'activities') {
    const selectFields = query.select as string[] | undefined;
    const selectsArtifactFields =
      selectFields?.some(
        (field) =>
          field === 'artifacts' ||
          field.startsWith('artifacts.') ||
          field === '*',
      ) ?? false;

    if (!selectsArtifactFields) {
      results = (results as Activity[]).map((a) => toLightweight(a));
    }
  }

  if (tokenBudget && Array.isArray(results)) {
    const shaped = truncateToTokenBudget(results, tokenBudget);
    results = shaped.items;
    truncated = shaped.truncated;
    tokenCount = shaped.tokenCount;
  }

  return {
    results: results as T[],
    _meta: tokenBudget ? { truncated, tokenCount, tokenBudget } : undefined,
  };
}
