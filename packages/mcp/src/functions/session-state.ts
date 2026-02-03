import type { JulesClient, Activity } from '@google/jules-sdk';
import type {
  SessionStateResult,
  SessionStatus,
  LastActivity,
  LastAgentMessage,
  PendingPlan,
} from './types.js';

const BUSY_STATES = new Set([
  'queued', 'QUEUED',
  'planning', 'PLANNING',
  'inProgress', 'IN_PROGRESS', 'in_progress',
]);
const FAILED_STATES = new Set(['failed', 'FAILED']);

/**
 * deriveStatus
 * Maps internal session state to semantic status.
 * - 'busy': Jules is actively working; data is volatile.
 * - 'stable': Work is paused; safe to review.
 * - 'failed': Session encountered an error.
 */
function deriveStatus(state: string): SessionStatus {
  if (FAILED_STATES.has(state)) return 'failed';
  if (BUSY_STATES.has(state)) return 'busy';
  return 'stable';
}

/**
 * Find the last activity from the activities list.
 */
function findLastActivity(activities: readonly Activity[]): LastActivity | undefined {
  if (activities.length === 0) return undefined;

  // Sort by createTime descending to find the most recent
  const sorted = [...activities]
    .sort((a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime());

  const last = sorted[0];
  if (!last) return undefined;

  return {
    activityId: last.id,
    type: last.type,
    timestamp: last.createTime,
  };
}

/**
 * Find the last agent message from activities.
 * Looks for 'agentMessaged' activities and extracts the message content.
 */
function findLastAgentMessage(activities: readonly Activity[]): LastAgentMessage | undefined {
  // Sort by createTime descending to find the most recent
  const sorted = [...activities]
    .filter(a => a.type === 'agentMessaged')
    .sort((a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime());

  const lastMessage = sorted[0];
  if (!lastMessage || lastMessage.type !== 'agentMessaged') return undefined;

  // The message is directly on the activity for agentMessaged type
  const content = lastMessage.message;
  if (!content) return undefined;

  return {
    activityId: lastMessage.id,
    content,
    timestamp: lastMessage.createTime,
  };
}

/**
 * Find a pending plan from activities.
 * Returns the most recent planGenerated activity's plan if it hasn't been approved.
 */
function findPendingPlan(activities: readonly Activity[]): PendingPlan | undefined {
  // Sort by createTime descending
  const sorted = [...activities]
    .sort((a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime());

  // Find the most recent planGenerated
  const planActivity = sorted.find(a => a.type === 'planGenerated');
  if (!planActivity || planActivity.type !== 'planGenerated') return undefined;

  // Check if there's a planApproved after this planGenerated
  const planApproved = sorted.find(a =>
    a.type === 'planApproved' &&
    new Date(a.createTime).getTime() > new Date(planActivity.createTime).getTime()
  );

  // If plan was approved, it's not pending
  if (planApproved) return undefined;

  const plan = planActivity.plan;
  if (!plan) return undefined;

  return {
    activityId: planActivity.id,
    planId: plan.id,
    steps: plan.steps.map(step => ({
      title: step.title,
      description: step.description,
    })),
  };
}


/**
 * Get the current state of a Jules session.
 *
 * Returns a semantic status indicating the session's operational state:
 * - status: 'busy' = Jules is working, data is volatile
 * - status: 'stable' = Work is paused, safe to review
 * - status: 'failed' = System-level failure, session unrecoverable
 *
 * Also includes the last activity, last agent message, and pending plan if any.
 *
 * @param client - The Jules client instance
 * @param sessionId - The session ID to query
 * @returns Session state including id, status, url, title, optional PR info, last activity, last agent message, and pending plan
 */
export async function getSessionState(
  client: JulesClient,
  sessionId: string,
): Promise<SessionStateResult> {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  const session = client.session(sessionId);

  // Hydrate activities to get the last activity and agent message
  await session.activities.hydrate();

  const snapshot = await session.snapshot();

  // FIX: Ensure activities is always an array
  const activities = snapshot.activities ?? [];

  const pr = snapshot.pr;
  const lastActivity = findLastActivity(activities);
  const lastAgentMessage = findLastAgentMessage(activities);
  const pendingPlan = findPendingPlan(activities);

  return {
    id: snapshot.id,
    status: deriveStatus(snapshot.state),
    url: snapshot.url,
    title: snapshot.title,
    ...(snapshot.prompt && { prompt: snapshot.prompt }),
    ...(pr && { pr: { url: pr.url, title: pr.title } }),
    ...(lastActivity && { lastActivity }),
    ...(lastAgentMessage && { lastAgentMessage }),
    ...(pendingPlan && { pendingPlan }),
  };
}
