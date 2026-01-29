import type { JulesClient } from '@google/jules-sdk';
import { getSessionState } from '../functions/session-state.js';
import { defineTool, toMcpResponse } from './utils.js';

export default defineTool({
  name: 'get_session_state',
  description: `Get the current status of a Jules session. Acts as a dashboard to determine if Jules is busy, waiting, or failed.

RETURNS: id, state, status, url, title, pr (if created)

STATUS (use this to decide what action to take):
- "busy": Jules is actively working. Data is volatile; do NOT review code changes yet.
- "stable": Work is paused. Safe to review code changes and outputs.
- "failed": Session encountered an error and cannot continue.

RAW STATES (for reference):
- queued/planning/inProgress → status: "busy"
- awaitingPlanApproval/awaitingUserFeedback/paused/completed → status: "stable"
- failed → status: "failed"

IMPORTANT:
- Use "status" to decide when to review, not "state".
- "completed" with status "stable" means work is done and safe to review.
- You can send messages to ANY session regardless of status.`,
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID (numeric string)',
      },
    },
    required: ['sessionId'],
  },
  handler: async (client: JulesClient, args: any) => {
    const result = await getSessionState(client, args.sessionId);
    return toMcpResponse(result);
  },
});
