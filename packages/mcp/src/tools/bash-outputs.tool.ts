import type { JulesClient } from '@google/jules-sdk';
import { getBashOutputs } from '../functions/bash-outputs.js';
import { defineTool, toMcpResponse } from './utils.js';

export default defineTool({
  name: 'get_bash_outputs',
  private: true,
  description:
    'Get all bash command outputs from a Jules session. Returns commands executed, their stdout/stderr, and exit codes. Use to understand what shell commands were run.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID to get bash outputs from.',
      },
      activityIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional activity IDs to get bash outputs from.',
      },
    },
    required: ['sessionId'],
  },
  handler: async (client: JulesClient, args: any) => {
    const result = await getBashOutputs(client, args.sessionId, args.activityIds);
    return toMcpResponse(result);
  },
});
