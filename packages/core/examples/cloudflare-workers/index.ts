import { jules } from '@google/jules-sdk';

/**
 * Cloudflare Worker Example
 *
 * This example demonstrates how to use the Jules SDK within a Cloudflare Worker environment.
 * The worker intercepts incoming HTTP POST requests (e.g., a webhook or custom event trigger)
 * and starts a new Jules coding session.
 */
export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    // Only accept POST requests for this example
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed. Please send a POST request.', { status: 405 });
    }

    try {
      // Parse the incoming JSON payload
      const payload = await request.json().catch(() => ({}));
      console.log('Received payload:', payload);

      // We can use the global `jules` object since JULES_API_KEY should be passed as an environment variable
      // or configured globally in the environment (e.g. via .env in local dev or Cloudflare bindings).
      // Note: If JULES_API_KEY is not available globally, you can construct a custom instance
      // of Jules SDK using `jules.with({ apiKey: env.JULES_API_KEY })`.

      // Construct a prompt dynamically from the payload
      const promptText = `Process this event triggered from a Cloudflare Worker: ${JSON.stringify(payload)}`;

      // Start a Jules session
      const session = await jules.session({
        prompt: promptText,
        // Define a target source context (replace with your repository/branch as needed)
        source: { github: 'davideast/dataprompt', baseBranch: 'main' },
      });

      console.log(`Successfully created Jules session: ${session.id}`);

      // Return a successful JSON response with the created session ID
      return new Response(JSON.stringify({
        success: true,
        message: 'Cloudflare Worker processed event and created a session.',
        sessionId: session.id,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });

    } catch (error) {
      console.error('Error creating session:', error);

      return new Response(JSON.stringify({
        success: false,
        message: 'Internal Server Error while creating Jules session',
        error: error instanceof Error ? error.message : String(error)
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
