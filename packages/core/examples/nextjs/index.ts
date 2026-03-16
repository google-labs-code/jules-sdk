import { jules } from '@google/jules-sdk';

// Pattern 1: Server Action (App Router)
// 'use server' // Uncomment in a real Next.js file
export async function triggerJulesTask(prompt: string) {
  if (!process.env.JULES_API_KEY) {
    throw new Error('JULES_API_KEY is not configured');
  }

  const session = await jules.session({
    prompt: `Review the following text and provide a summary:\n\n${prompt}`,
  });

  console.log(`[Server Action] Session: ${session.id}`);
  return { success: true, sessionId: session.id };
}

// Pattern 2: API Route Handler (App Router)
// Place in: app/api/jules/route.ts
export async function POST(req: Request) {
  if (!process.env.JULES_API_KEY) {
    return Response.json({ error: 'JULES_API_KEY missing' }, { status: 500 });
  }

  const body = await req.json() as { githubUrl?: string; taskDescription?: string };
  const { githubUrl, taskDescription } = body;

  if (!githubUrl || !taskDescription) {
    return Response.json({ error: 'Missing parameters' }, { status: 400 });
  }

  // Fire-and-forget: create session and return immediately
  const session = await jules.session({
    prompt: taskDescription,
    source: { github: githubUrl, baseBranch: 'main' },
  });

  console.log(`[API Route] Session: ${session.id}`);
  return Response.json({ sessionId: session.id });
}

// Self-test when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.JULES_API_KEY) {
    console.error('Set JULES_API_KEY to run this example.');
    process.exit(1);
  }

  const result = await triggerJulesTask('Next.js Server Actions are great for mutations.');
  console.log(`Server Action: ${result.sessionId}`);

  const response = await POST(new Request('http://localhost:3000/api/jules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ githubUrl: 'davideast/dataprompt', taskDescription: 'Remove console.log statements.' }),
  }));

  const data = await response.json() as { sessionId?: string };
  console.log(`API Route: ${data.sessionId}`);
}
