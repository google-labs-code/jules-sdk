# Express Integration Example

This example demonstrates how to integrate the Jules SDK into an Express application.

It covers a common pattern for starting Jules sessions from a REST API endpoint.

## Prerequisites

- A Jules API Key (`JULES_API_KEY` environment variable).

## How to use in your Express app

You can use the `POST /api/jules` endpoint pattern from `index.ts` to create a REST endpoint for your Express application to trigger Jules sessions.

```typescript
import express, { Request, Response } from 'express';
import { jules } from '@google/jules-sdk';

const app = express();
app.use(express.json());

app.post('/api/jules', async (req: Request, res: Response) => {
  try {
    const { githubUrl, taskDescription } = req.body;

    const session = await jules.session({
      prompt: taskDescription,
      source: { github: githubUrl },
    });

    return res.status(200).json({ sessionId: session.id });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});
```

## Running the Example Locally

The `index.ts` file includes a runnable test script to verify that the Express endpoint works as expected.

Ensure you have your API key set:

```bash
export JULES_API_KEY="your-api-key-here"
```

Then, you can run the file using `bun` (or another runner like `tsx`):

```bash
bun run index.ts
```
