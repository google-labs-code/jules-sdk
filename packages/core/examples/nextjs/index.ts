import { jules } from '@google/jules-sdk';

/**
 * Next.js Integration Example
 *
 * This file demonstrates how to integrate the Jules SDK into a Next.js application.
 * It provides two common patterns:
 * 1. A Server Action (App Router)
 * 2. An API Route Handler (App Router)
 */

// ============================================================================
// Pattern 1: Next.js Server Action
// ============================================================================
// Typically placed in a file like `app/actions.ts` or inline with components.
//
// 'use server' // Uncomment this in a real Next.js Server Action file

/**
 * A server action to trigger a Jules session from a form submission or button click.
 */
export async function triggerJulesTask(prompt: string) {
  try {
    // Check if the API key is configured (Next.js automatically loads .env files)
    if (!process.env.JULES_API_KEY) {
      throw new Error('JULES_API_KEY is not configured');
    }

    // Example: Create a repoless session for a simple task
    const session = await jules.session({
      prompt: `Review the following text and provide a summary: \n\n${prompt}`,
    });

    console.log(`[Server Action] Session created: ${session.id}`);

    // In a real application, you might save the session.id to your database here
    // so the client can poll or subscribe to updates.

    return { success: true, sessionId: session.id };
  } catch (error) {
    console.error('[Server Action] Failed to start Jules task:', error);
    return { success: false, error: 'Failed to start task' };
  }
}

// ============================================================================
// Pattern 2: Next.js API Route Handler
// ============================================================================
// Typically placed in a file like `app/api/jules/route.ts`

/**
 * A Next.js App Router API Handler (POST method)
 *
 * @param req NextRequest
 */
export async function POST(req: Request) {
  try {
    if (!process.env.JULES_API_KEY) {
      return new Response(JSON.stringify({ error: 'JULES_API_KEY missing' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { githubUrl, taskDescription } = body;

    if (!githubUrl || !taskDescription) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Example: Create a session linked to a GitHub repository
    const session = await jules.session({
      prompt: taskDescription,
      source: { github: githubUrl },
    });

    console.log(`[API Route] Session created: ${session.id}`);

    // Return the session ID to the client
    return new Response(JSON.stringify({ sessionId: session.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[API Route] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ============================================================================
// Local Test Runner
// ============================================================================
// This allows you to run this example file directly to verify it works.

async function main() {
  if (!process.env.JULES_API_KEY) {
    console.error('Error: JULES_API_KEY environment variable is not set.');
    console.error('Please set it using: export JULES_API_KEY="your-api-key"');
    process.exit(1);
  }

  console.log('Testing Server Action example...');
  const result = await triggerJulesTask('Next.js Server Actions are great for mutations.');

  if (result.success) {
    console.log(`Server Action successfully created session: ${result.sessionId}`);
  } else {
    console.error('Server Action failed:', result.error);
  }

  console.log('\\nTesting API Route example...');
  // Simulate a Next.js Request object
  const mockRequest = new Request('http://localhost:3000/api/jules', {
    method: 'POST',
    body: JSON.stringify({
      githubUrl: 'google-labs-code/jules-sdk',
      taskDescription: 'Look for any console.log statements and remove them.'
    }),
    headers: { 'Content-Type': 'application/json' }
  });

  const response = await POST(mockRequest);
  const responseData = await response.json();

  if (response.ok) {
    console.log(`API Route successfully created session: ${responseData.sessionId}`);
  } else {
    console.error('API Route failed:', responseData.error);
  }
}

// Run the main function if executed directly (e.g. via `bun run index.ts`)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
