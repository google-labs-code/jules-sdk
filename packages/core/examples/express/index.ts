import express, { Request, Response, NextFunction } from 'express';
import { jules } from '@google/jules-sdk';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Middleware: check JULES_API_KEY for all /api routes
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (!process.env.JULES_API_KEY) {
    return res.status(500).json({ error: 'JULES_API_KEY missing' });
  }
  return next();
});

app.post('/api/jules', async (req: Request, res: Response) => {
  try {
    const { githubUrl, taskDescription } = req.body;
    if (!githubUrl || !taskDescription) {
      return res.status(400).json({ error: 'Missing githubUrl or taskDescription' });
    }

    // Fire-and-forget: create session and return immediately
    const session = await jules.session({
      prompt: taskDescription,
      source: { github: githubUrl, baseBranch: 'main' },
    });

    console.log(`Session created: ${session.id}`);
    return res.status(200).json({ sessionId: session.id });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Self-test when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.JULES_API_KEY) {
    console.error('Set JULES_API_KEY to run this example.');
    process.exit(1);
  }

  const server = app.listen(port, () => {
    console.log(`Express server on port ${port}`);
  });

  try {
    const response = await fetch(`http://localhost:${port}/api/jules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        githubUrl: 'davideast/dataprompt',
        taskDescription: 'Remove console.log statements.',
      }),
    });

    const data = await response.json() as { sessionId?: string; error?: string };
    if (response.ok) {
      console.log(`Session created: ${data.sessionId}`);
    } else {
      console.error('Failed:', data.error);
    }
  } finally {
    server.close();
  }
}

export default app;
