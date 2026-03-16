import type { Activity, SessionClient } from '@google/jules-sdk';

type ActivityType = Activity['type'];

/** Typed handler map for stream activities. Unspecified types are silently ignored. */
export type StreamHandlers = {
  [K in ActivityType]?: (activity: Extract<Activity, { type: K }>) => void;
};

/**
 * Streams a session with typed event handlers — no switch/if chains needed.
 *
 * @example
 * ```ts
 * await logStream(session, {
 *   agentMessaged: (a) => console.log(`Agent: ${a.message}`),
 *   progressUpdated: (a) => console.log(`Progress: ${a.title}`),
 * });
 * ```
 */
export async function logStream(session: SessionClient, handlers: StreamHandlers) {
  for await (const activity of session.stream()) {
    const handler = handlers[activity.type] as ((a: Activity) => void) | undefined;
    handler?.(activity);
  }
}
