import type { JulesClient, JulesQuery, JulesDomain } from '@google/jules-sdk';
import { select } from '../functions/select.js';
import { defineTool, toMcpResponse } from './utils.js';
import { validateQuery } from '../functions/validate-query.js';
import { getSchema } from '../functions/schema.js';

export default defineTool({
  name: 'query_cache',
  description:
    'Query the LOCAL CACHE of sessions and activities. Returns only previously synced data (fast, but may be stale). To ensure fresh data: call jules_sync first, then jules_select. Best for searching across multiple sessions or filtering by type/state.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'object',
        description: 'The JulesQuery object defining the selection criteria.',
        properties: {
          from: {
            type: 'string',
            enum: ['sessions', 'activities'],
            description: 'The domain to query from.',
          },
          select: {
            type: 'array',
            items: { type: 'string' },
            description: 'Fields to project.',
          },
          where: {
            type: 'object',
            description: 'Filter criteria.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return.',
          },
          offset: {
            type: 'number',
            description: 'Number of results to skip.',
          },
          include: {
            type: 'object',
            description: 'Related data to include.',
          },
          tokenBudget: {
            type: 'number',
            description:
              'Maximum tokens for response. Results truncated to fit.',
          },
        },
        required: ['from'],
      },
    },
    required: ['query'],
  },
  handler: async (client: JulesClient, args: any) => {
    const query = args?.query as JulesQuery<JulesDomain>;
    const tokenBudget = args?.query?.tokenBudget as number | undefined;
    const validationResult = validateQuery(query);
    if (!validationResult.valid) {
      const schemaResult = getSchema(query?.from || 'all', 'markdown');
      return toMcpResponse({
        valid: validationResult.valid,
        error: validationResult.errors,
        message: validationResult.message,
        warnings: validationResult.warnings,
        schema: schemaResult.content,
      });
    }
    const result = await select(client, query, { tokenBudget });
    return toMcpResponse(result);
  },
});
