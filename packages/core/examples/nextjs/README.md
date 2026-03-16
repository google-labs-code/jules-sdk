# Next.js Integration

Two patterns for using Jules in a Next.js App Router application: a Server Action for form-based workflows and an API Route Handler for REST-style integrations.

## Quick Start

```bash
npm install
export JULES_API_KEY="your-api-key"
bun run index.ts
```

Runs a self-test exercising both patterns without a full Next.js server.

## Server Action Pattern

Drop into `app/actions.ts`. Creates a repoless session — good for form submissions where a user types a task:

```typescript
'use server'
export async function triggerJulesTask(prompt: string) {
  const session = await jules.session({ prompt });
  return { success: true, sessionId: session.id };
}
```

## API Route Handler Pattern

Drop into `app/api/jules/route.ts`. Creates a repo-based session — better for external clients and webhooks:

```typescript
export async function POST(req: Request) {
  const { githubUrl, taskDescription } = await req.json();
  const session = await jules.session({
    prompt: taskDescription,
    source: { github: githubUrl, baseBranch: 'main' },
  });
  return Response.json({ sessionId: session.id });
}
```

## Self-Test Mode

When run directly, the script detects it via `import.meta.url` and calls both patterns, logging the session IDs. The same file works as both a module and a standalone script.
