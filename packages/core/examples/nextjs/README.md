# Next.js Integration Example

This example demonstrates how to integrate the Jules SDK into a Next.js application using the App Router.

It covers two common patterns for starting Jules sessions from a Next.js application:
1. **Server Actions:** Ideal for form submissions and simple mutations.
2. **API Route Handlers:** Ideal for webhooks, external client integrations, or more complex APIs.

## Prerequisites

- A Jules API Key (`JULES_API_KEY` environment variable).

## How to use in your Next.js app

### 1. Server Actions

You can use the `triggerJulesTask` pattern from `index.ts` directly in your Next.js application.

Create a file like `app/actions.ts` and add `'use server'` at the top:

```typescript
'use server'

import { jules } from '@google/jules-sdk';

export async function triggerJulesTask(prompt: string) {
  const session = await jules.session({ prompt });
  return { success: true, sessionId: session.id };
}
```

Then, import and call this action from your Client Components or Server Components.

### 2. API Route Handlers

You can copy the `POST` function pattern to a file like `app/api/jules/route.ts` to create a REST endpoint for your Next.js application.

```typescript
import { jules } from '@google/jules-sdk';

export async function POST(req: Request) {
  const body = await req.json();
  const session = await jules.session({
    prompt: body.taskDescription,
    source: { github: body.githubUrl },
  });

  return new Response(JSON.stringify({ sessionId: session.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## Running the Example Locally

The `index.ts` file includes a runnable test script to verify that both the Server Action function and the API Route function work as expected.

Ensure you have your API key set:

```bash
export JULES_API_KEY="your-api-key-here"
```

Then, you can run the file using `bun` (or another runner like `tsx`):

```bash
bun run index.ts
```
