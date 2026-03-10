import express, { Request, Response } from 'express';
import { jules } from '@google/jules-sdk';

/**
 * Express Integration Example
 *
 * This file demonstrates how to integrate the Jules SDK into an Express application.
 * It provides a common pattern for starting Jules sessions from a REST API endpoint.
 */

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// ============================================================================
// Express Route Handler
// ============================================================================

/**
 * A POST endpoint to create a new Jules session
 */
app.post('/api/jules', async (req: Request, res: Response) => {
  try {
    // Check if the API key is configured
    if (!process.env.JULES_API_KEY) {
      return res.status(500).json({ error: 'JULES_API_KEY missing' });
    }

    const { githubUrl, taskDescription } = req.body;

    // Validate required parameters
    if (!githubUrl || !taskDescription) {
      return res.status(400).json({ error: 'Missing parameters: githubUrl and taskDescription are required' });
    }

    // Example: Create a session linked to a GitHub repository
    const session = await jules.session({
      prompt: taskDescription,
      source: { github: githubUrl },
    });

    console.log(`[API Route] Session created: ${session.id}`);

    // Return the session ID to the client so they can poll or subscribe to updates
    return res.status(200).json({ sessionId: session.id });
  } catch (error) {
    console.error('[API Route] Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

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

  // Start the server
  const server = app.listen(port, () => {
    console.log(`Express server listening on port ${port}`);
  });

  try {
    console.log('\\nTesting Express API endpoint...');

    // Send a test request to our own endpoint
    const response = await fetch(`http://localhost:${port}/api/jules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        githubUrl: 'google-labs-code/jules-sdk',
        taskDescription: 'Look for any console.log statements and remove them.'
      }),
    });

    const responseData = await response.json();

    if (response.ok) {
      console.log(`API endpoint successfully created session: ${responseData.sessionId}`);
    } else {
      console.error('API endpoint failed:', responseData.error);
    }
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    // Stop the server so the script can exit
    server.close(() => {
      console.log('Server closed');
    });
  }
}

// Run the main function if executed directly (e.g. via `bun run index.ts`)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

// Export the app for testing or mounting elsewhere
export default app;
