import type { JulesClient } from '@google/jules-sdk';
import type { SessionStateResult, SessionStatus } from './types.js';

/**
 * States where Jules is actively working and data may be volatile.
 * Includes both API format (SCREAMING_SNAKE_CASE) and SDK format (camelCase).
 */
const BUSY_STATES = new Set([
  'queued', 'QUEUED',
  'planning', 'PLANNING',
  'inProgress', 'IN_PROGRESS', 'in_progress',
]);

/**
 * Failed states in both formats.
 */
const FAILED_STATES = new Set(['failed', 'FAILED']);

/**
 * Derives a semantic status from the technical session state.
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
 * Get the current state of a Jules session.
 *
 * Returns both the raw technical state and a semantic status:
 * - status: 'busy' = Jules is working, data is volatile
 * - status: 'stable' = Work is paused, safe to review
 *
 * @param client - The Jules client instance
 * @param sessionId - The session ID to query
 * @returns Session state including id, state, status, url, title, and optional PR info
 */
export async function getSessionState(
  client: JulesClient,
  sessionId: string,
): Promise<SessionStateResult> {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  const session = client.session(sessionId);
  const snapshot = await session.snapshot();

  const pr = snapshot.pr;
  return {
    id: snapshot.id,
    state: snapshot.state,
    status: deriveStatus(snapshot.state),
    url: snapshot.url,
    title: snapshot.title,
    ...(pr && { pr: { url: pr.url, title: pr.title } }),
  };
}
