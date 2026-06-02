import type { JulesClient } from '@google/jules-sdk';
import type { DeleteSessionOptions, DeleteSessionResult } from './types.js';

/**
 * Deletes sessions by ID or filter.
 *
 * @param client - The Jules client instance
 * @param options - Deletion options (sessionId, filter, force)
 * @returns Deletion result
 */
export async function deleteSession(
  client: JulesClient,
  options: DeleteSessionOptions,
): Promise<DeleteSessionResult> {
  const { sessionId, filter, force } = options;

  if (sessionId) {
    try {
      await client.session(sessionId).delete();
      return {
        success: true,
        deletedCount: 1,
        sessionIds: [sessionId],
        message: `Session ${sessionId} deleted successfully.`,
      };
    } catch (error: any) {
      return {
        success: false,
        deletedCount: 0,
        sessionIds: [],
        message: `Failed to delete session ${sessionId}: ${error.message}`,
      };
    }
  }

  if (filter) {
    const sessionsToDelete: string[] = [];

    // Iterate through all sessions to find matches.
    // By default client.sessions() excludes archived sessions, which is usually desired.
    for await (const session of client.sessions()) {
      let match = false;
      switch (filter) {
        case 'completed':
          match = session.state === 'completed';
          break;
        case 'failed':
          match = session.state === 'failed';
          break;
        case 'running':
          match = [
            'queued',
            'planning',
            'inProgress',
            'awaitingPlanApproval',
            'awaitingUserFeedback',
            'paused',
          ].includes(session.state);
          break;
        case 'queued':
          match = session.state === 'queued';
          break;
        case 'planning':
          match = session.state === 'planning';
          break;
        case 'inProgress':
          match = session.state === 'inProgress';
          break;
        case 'awaitingPlanApproval':
          match = session.state === 'awaitingPlanApproval';
          break;
      }

      if (match) {
        sessionsToDelete.push(session.id);
      }
    }

    if (sessionsToDelete.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        sessionIds: [],
        message: `No sessions found matching filter: ${filter}`,
      };
    }

    if (!force) {
      return {
        success: false,
        deletedCount: 0,
        sessionIds: sessionsToDelete,
        message: `Found ${sessionsToDelete.length} sessions matching filter "${filter}". Use 'force: true' to delete them.`,
        requiresForce: true,
      };
    }

    const deletedIds: string[] = [];
    const errors: string[] = [];

    // Delete in parallel with some concurrency or sequentially?
    // Let's go with sequential for safety or use a simple loop.
    for (const id of sessionsToDelete) {
      try {
        await client.session(id).delete();
        deletedIds.push(id);
      } catch (error: any) {
        errors.push(`Failed to delete session ${id}: ${error.message}`);
      }
    }

    return {
      success: errors.length === 0,
      deletedCount: deletedIds.length,
      sessionIds: deletedIds,
      message:
        errors.length === 0
          ? `Successfully deleted ${deletedIds.length} sessions matching filter "${filter}".`
          : `Deleted ${deletedIds.length} sessions with ${errors.length} errors. Errors: ${errors.join('; ')}`,
    };
  }

  return {
    success: false,
    deletedCount: 0,
    sessionIds: [],
    message: 'Either sessionId or filter must be provided.',
  };
}
