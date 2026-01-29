import type { JulesClient } from '@google/jules-sdk';
import type { InteractResult, InteractAction } from './types.js';

/**
 * Interact with an active Jules session.
 *
 * @param client - The Jules client instance
 * @param sessionId - The session ID to interact with
 * @param action - The action to perform: 'approve', 'send', or 'ask'
 * @param message - Required message for 'send' and 'ask' actions
 * @returns Result of the interaction
 */
export async function interact(
  client: JulesClient,
  sessionId: string,
  action: InteractAction,
  message?: string,
): Promise<InteractResult> {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  const session = client.session(sessionId);

  if (action === 'approve') {
    await session.approve();
    return { success: true, message: 'Plan approved.' };
  }

  if (action === 'send') {
    if (!message) {
      throw new Error("Message is required for 'send' action");
    }
    await session.send(message);
    return { success: true, message: 'Message sent.' };
  }

  if (action === 'ask') {
    if (!message) {
      throw new Error("Message is required for 'ask' action");
    }
    const reply = await session.ask(message);
    return { success: true, reply: reply.message };
  }

  throw new Error(`Invalid action: ${action}`);
}
