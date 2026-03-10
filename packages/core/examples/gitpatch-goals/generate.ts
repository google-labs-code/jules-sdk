import { jules, SessionClient } from '@google/jules-sdk';

/**
 * Initiates the generation session and streams progress updates back
 * to the caller until the session completes.
 */
export async function generateCode(prompt: string): Promise<SessionClient> {
  console.error('--- Step 1: Initiating Code Generation Session ---');

  // Repoless sessions don't always create the resource instantly,
  // we must await the outcome state for streaming to reliably start without 404ing activities
  const session = await jules.session({ prompt });

  console.error(`Generation Session created! ID: ${session.id}`);
  console.error('Streaming agent progress...\n');

  try {
    for await (const activity of session.stream()) {
      if (activity.type === 'progressUpdated') {
        console.error(`[Generation] ${activity.title}`);
      } else if (activity.type === 'agentMessaged') {
        console.error(`[Generation Agent]: ${activity.message.substring(0, 100)}...`);
      } else if (activity.type === 'sessionCompleted') {
        console.error('[Generation] Session complete.');
      } else if (activity.type === 'sessionFailed') {
        console.error('[Generation] Session failed.');
      }
    }
  } catch (err) {
    // A 404 indicates the activities sub-collection might not be ready yet.
    // The safest fallback is waiting for the result.
    console.error('[Generation] Streaming not available yet. Waiting for completion...');
  }

  return session;
}
