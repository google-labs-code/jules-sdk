import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { jules } from '@google/jules-sdk';

const app = new Hono();

app.post('/webhook', async (c) => {
  try {
    const payload = await c.req.json();
    console.log('Received webhook payload:', payload);

    // Create a new Jules session triggered by the webhook
    const session = await jules.session({
      prompt: `Process this webhook payload: ${JSON.stringify(payload)}`,
      // Provide a default repository or adapt to your needs
      source: { github: 'davideast/dataprompt', baseBranch: 'main' },
    });

    console.log(`Created Jules session: ${session.id}`);

    return c.json({
      success: true,
      message: 'Webhook processed and session created successfully',
      sessionId: session.id,
    }, 200);

  } catch (error) {
    console.error('Error processing webhook:', error);
    return c.json({
      success: false,
      message: 'Failed to process webhook',
    }, 500);
  }
});

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
