import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { jules } from '@google/jules-sdk';

const app = new Hono();

// Example 1: Create a simple, fire-and-forget repoless session
app.post('/api/sessions/create', async (c) => {
  try {
    const { prompt } = await c.req.json();

    if (!prompt) {
      return c.json({ error: 'Prompt is required' }, 400);
    }

    // Start a basic session
    // In a real application, you might save the session.id to your database
    const session = await jules.session({ prompt });

    return c.json({
      message: 'Session created successfully',
      sessionId: session.id,
      status: session.info().state,
    });
  } catch (error) {
    console.error('Failed to create session:', error);
    return c.json({ error: 'Failed to create session' }, 500);
  }
});

// Example 2: Check the status of a specific session
app.get('/api/sessions/:id/status', async (c) => {
  const sessionId = c.req.param('id');

  try {
    // Retrieve an existing session by ID
    const session = jules.session(sessionId);
    const info = session.info();

    return c.json({
      sessionId: session.id,
      state: info.state,
      createdAt: info.createTime,
    });
  } catch (error) {
    console.error(`Failed to fetch status for session ${sessionId}:`, error);
    return c.json({ error: 'Failed to fetch session status' }, 500);
  }
});

// Example 3: Stream activities to the client using Server-Sent Events (SSE)
app.get('/api/sessions/:id/stream', async (c) => {
  const sessionId = c.req.param('id');

  return streamSSE(c, async (stream) => {
    try {
      const session = jules.session(sessionId);

      // Iterate over the stream of activities from the agent
      for await (const activity of session.stream()) {
        const data = JSON.stringify({
          type: activity.type,
          timestamp: activity.createTime,
          // Safely pull relevant fields depending on activity type
          message: activity.type === 'agentMessaged' ? activity.message : undefined,
          summary: activity.summary,
        });

        // Write the event to the stream in SSE format
        await stream.writeSSE({
            data: data,
        });
      }

      await stream.writeSSE({
          event: 'done',
          data: 'Session completed',
      });
    } catch (error) {
      console.error(`Streaming failed for session ${sessionId}:`, error);
      await stream.writeSSE({
          event: 'error',
          data: 'Error streaming session activities',
      });
    }
  });
});

const port = 3000;
console.log(`Hono server running at http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
