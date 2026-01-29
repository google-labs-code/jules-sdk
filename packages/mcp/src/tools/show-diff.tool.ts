import type { JulesClient } from '@google/jules-sdk';
import { showDiff } from '../functions/show-diff.js';
import { defineTool, toMcpResponse } from './utils.js';

export default defineTool({
  name: 'show_code_diff',
  description:
    'Show the actual code diff for files from a Jules session. ' +
    'Returns unified diff format that can be displayed to users. ' +
    'Use after jules_review_changes to drill into specific file changes.',
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
    },
    required: ['sessionId'],
  },
  handler: async (client: JulesClient, args: any) => {
    const result = await showDiff(client, args.sessionId, {
      file: args.file,
    });
    // Return the unidiff patch for display
    if (!result.unidiffPatch) {
      return toMcpResponse('No changes found in this session.');
    }
    return toMcpResponse(result.unidiffPatch);
  },
});
