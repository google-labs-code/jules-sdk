import type { JulesClient } from '@google/jules-sdk';
import { getSessionState } from '../functions/session-state.js';
import { defineTool, toMcpResponse } from './utils.js';

export default defineTool({
  name: 'get_session_state',
  description: `Get the current status of a Jules session. Acts as a dashboard to determine if Jules is busy, waiting, or failed.

RETURNS: id, status, url, title, prompt, pr (if created), lastActivity, lastAgentMessage (if any), pendingPlan (if awaiting approval)

STATUS (use this to decide what action to take):
- "busy": Jules is actively working. Peek with get_code_review_context if needed.
- "stable": Work is paused. Safe to review code, send messages, or check outputs.
- "failed": System-level failure (like a 500). Session cannot continue.

LAST ACTIVITY:
- Shows what just happened (activityId, type, timestamp)
- Common types: agentMessaged, sessionCompleted, progressUpdated, userMessaged, planGenerated

LAST AGENT MESSAGE:
- Contains the last message Jules sent (activityId, content, timestamp)
- Read this to understand what Jules communicated
- If Jules asked a question, you can respond using send_reply_to_session

PENDING PLAN:
- Present when a plan is awaiting approval (lastActivity.type is 'planGenerated')
- Contains planId and steps (title, description for each step)
- Use send_reply_to_session with action 'approve' to approve the plan

NEXT ACTIONS:
- busy → Wait for completion, or peek with get_code_review_context
- stable + pendingPlan → Review the plan steps, then approve or send feedback
- stable + lastAgentMessage → Read message, respond if Jules asked something
- stable + no message → Review PR or code changes with get_code_review_context
- failed → Report to user. Session is unrecoverable.

IMPORTANT:
- You can send messages to ANY session regardless of status.
- A session is never truly "done" unless it's failed. You can always continue the conversation.`,
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
