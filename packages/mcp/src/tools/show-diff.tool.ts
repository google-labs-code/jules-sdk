import type { JulesClient } from '@google/jules-sdk';
import { showDiff } from '../functions/show-diff.js';
import { defineTool, toMcpResponse } from './utils.js';

export default defineTool({
  name: 'show_code_diff',
  description:
    'Show the actual code diff for files from a Jules session. ' +
    'Returns unified diff format that can be displayed to users. ' +
    'Use after get_code_review_context to drill into specific file changes. ' +
    'Can optionally show diff from a specific activity (use activity IDs from get_code_review_context output).',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The Jules session ID to get diff from.',
      },
      file: {
        type: 'string',
        description:
          'File path to show diff for. Omit to get all diffs (may be large).',
      },
      activityId: {
        type: 'string',
        description:
          'Optional activity ID to get diff from a specific activity instead of the session outcome. ' +
          'Use activity IDs shown in get_work_in_progress output.',
      },
    },
    required: ['sessionId'],
  },
  handler: async (client: JulesClient, args: any) => {
    const result = await showDiff(client, args.sessionId, {
      file: args.file,
      activityId: args.activityId,
    });
    // Return the unidiff patch for display
    if (!result.unidiffPatch) {
      const context = args.activityId
        ? `activity ${args.activityId}`
        : 'this session';
      return toMcpResponse(`No changes found in ${context}.`);
    }
    return toMcpResponse(result.unidiffPatch);
  },
});
