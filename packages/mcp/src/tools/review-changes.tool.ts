import type { JulesClient } from '@google/jules-sdk';
import { reviewChanges } from '../functions/review-changes.js';
import { defineTool, toMcpResponse } from './utils.js';

export default defineTool({
  name: 'get_code_review_context',
  description:
    'Review code changes from a Jules session. Returns a structured summary of what changed, ' +
    'organized by file with change types and line counts. Use this to understand what Jules produced ' +
    'before deciding to apply changes. For detailed diffs, use jules_show_diff.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The Jules session ID to review.',
      },
      format: {
        type: 'string',
        enum: ['summary', 'tree', 'detailed', 'markdown'],
        description:
          'Output format: summary (default) for overview with stats, tree for directory structure, detailed for full file list, markdown for full session report.',
      },
      filter: {
        type: 'string',
        enum: ['all', 'created', 'modified', 'deleted'],
        description: 'Filter by change type. Defaults to all.',
      },
      detail: {
        type: 'string',
        enum: ['minimal', 'standard', 'full'],
        description:
          'Detail level: minimal (files only), standard (default, + insights/timing), full (+ activity counts).',
      },
    },
    required: ['sessionId'],
  },
  handler: async (client: JulesClient, args: any) => {
    const result = await reviewChanges(client, args.sessionId, {
      format: args.format,
      filter: args.filter,
      detail: args.detail,
    });
    return toMcpResponse(result.formatted);
  },
});

