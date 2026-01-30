import type { JulesClient } from '@google/jules-sdk';
import { codeReview } from '../functions/code-review.js';
import { defineTool, toMcpResponse } from './utils.js';

export default defineTool({
  name: 'get_code_review_context',
  description:
    'Review code changes from a Jules session. Returns a structured summary of what changed, ' +
    'organized by file with change types, line counts, and activity IDs. ' +
    'Automatically detects if session is busy (aggregates from activities) or stable (uses final outcome). ' +
    'Can optionally scope to a single activity. For detailed diffs, use show_code_diff.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The Jules session ID to review.',
      },
      activityId: {
        type: 'string',
        description:
          'Optional activity ID to review changes from a single activity instead of the whole session.',
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
    const result = await codeReview(client, args.sessionId, {
      format: args.format,
      filter: args.filter,
      detail: args.detail,
      activityId: args.activityId,
    });
    return toMcpResponse(result.formatted);
  },
});
