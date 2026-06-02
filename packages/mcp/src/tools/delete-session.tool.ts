import type { JulesClient } from '@google/jules-sdk';
import { deleteSession } from '../functions/delete-session.js';
import { defineTool, toMcpResponse } from './utils.js';

export default defineTool({
  name: 'delete_session',
  description: 'Deletes one or more Jules sessions.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The unique ID of the session to delete.',
      },
      filter: {
        type: 'string',
        description: 'A filter to delete multiple sessions.',
        enum: [
          'completed',
          'failed',
          'running',
          'queued',
          'planning',
          'inProgress',
          'awaitingPlanApproval',
        ],
      },
      force: {
        type: 'boolean',
        description: 'Required when deleting multiple sessions via filter.',
      },
    },
  },
  handler: async (client: JulesClient, args: any) => {
    const result = await deleteSession(client, {
      sessionId: args?.sessionId,
      filter: args?.filter,
      force: args?.force,
    });
    return toMcpResponse(result);
  },
});
