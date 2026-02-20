# Jules SDK

## An SDK for running a fleet of coding agents in the Cloud

Orchestrate complex, long-running coding tasks to an ephemeral cloud environment integrated with a GitHub repo.

## Send work to a Cloud based session

```ts
import { jules } from '@google/jules-sdk';

const session = await jules.session({
  prompt: `Fix visibility issues in the examples/nextjs app.

  **Visibility issues**
  - White text on white backgrounds
  - Low contrast on button hover

  **Instructions**
  - Update the global styles and page components to a dark theme with the shadcn zinc palette.
`,
  source: { github: 'davideast/dataprompt', baseBranch: 'main' },
  autoPr: true,
});
```

## Monitor agent progress

```ts
import { jules } from '@google/jules-sdk';

const session = jules.session('<session-id>');

for await (const activity of session.stream()) {
  switch (activity.type) {
    case 'planGenerated':
      console.log(`${activity.plan.steps.length} steps.`);
      break;
    case 'progressUpdated':
      console.log(`${activity.title}`);
      // Check for code updates
      if (artifact.type === 'changeSet') {
        const parsed = artifact.parsed();
        for (const file of parsed.files) {
          console.log(`${file.path}: +${file.additions} -${file.deletions}`);
        }
      }
      break;
    case 'sessionCompleted':
      console.log('Session finished successfully.');
      break;
  }
}

// Get the pull-request URL once complete
const outcome = await session.result();
if (outcome.pullRequest) {
  console.log(`PR: ${outcome.pullRequest.url}`);
}
```

## Installation

```bash
npm i @google/jules-sdk
export JULES_API_KEY=<api-key>
```

## Core Features

### Run Cloud Functions with a Coding Agent

Jules sessions run in the cloud and can run without a GitHub repository. We call these "Repoless" sessions. They are incredibly powerful because they act like preconfigured serverless functions. The Jules VM comes with a preconfigured image with Node.js, Python, Rust, Bun, and other many other runtimes and tools.

Pass context through the prompt and have the agent generate the result.

```ts
import { jules } from '@google/jules-sdk';
import { sql } from 'drizzle-orm';

const longDocumentsNobodyWantsToRead = await sql`SELECT * FROM documents`;
const userPrompt = process.argv[2];

const session = await jules.session({
  prompt: `You are a assistant that can read long documents and answer questions about them.

  ## The user's question
  ${userPrompt}

  ## The documents
  ${longDocumentsNobodyWantsToRead.map((e) => e.title).join('\n')}
  
  ## Answer Format
  Create a markdown response with the following sections:
  - Summary
  - Answer
  - Sources Cited
  `,
});

const result = await session.result();
const files = result.generatedFiles();
const answer = files.get('answer.md');
console.log(answer?.content);

// Call the script as CLI
// node index.js "Review the policies and explain to me delivery timelines like I'm 7 years old."
```

### Interactive Sessions

Use `jules.session()` for workflows where you observe, provide feedback, and guide the process.

```typescript
const session = await jules.session({
  prompt: 'Refactor the user authentication module.',
  source: { github: 'your-org/your-repo', baseBranch: 'develop' },
});

console.log(`Session created: ${session.id}`);

await session.waitFor('awaitingPlanApproval');
console.log('Plan is ready. Approving it now.');
await session.approve();

const reply = await session.ask(
  'Start with the first step and let me know when it is done.',
);
console.log(`[AGENT] ${reply.message}`);

const outcome = await session.result();
console.log(`Session finished with state: ${outcome.state}`);
```

### Create a fleet of agent sessions

Process multiple items in parallel with `jules.all()`. Feels like `Promise.all()` but with built-in concurrency control.

```javascript
const todos = ['Fix login bug', 'Update README', 'Refactor tests'];

const sessions = await jules.all(todos, (task) => ({
  prompt: task,
  source: { github: 'user/repo', baseBranch: 'main' },
}));

console.log(`Created ${sessions.length} sessions.`);
```

For more control over the concurrency count and error handling.

```javascript
const sessions = await jules.all(largeList, mapFn, {
  concurrency: 10,
  stopOnError: false,
  delayMs: 500,
});
```

### Query your local knowledge base

The SDK caches session data locally and exposes a query language for filtering and projecting across all sessions.

```typescript
// Find failed sessions
const failures = await jules.select({
  from: 'sessions',
  where: { state: 'failed' },
  limit: 10,
});

// Get recent agent messages with computed summaries
const messages = await jules.select({
  from: 'activities',
  where: { type: 'agentMessaged' },
  select: ['id', 'createTime', 'summary', 'artifactCount'],
  order: 'desc',
  limit: 5,
});

// Find activities with bash errors (exitCode > 0)
const errors = await jules.select({
  from: 'activities',
  where: { 'artifacts.exitCode': { $gt: 0 } },
});
```

### Reactive Streams

The `.stream()` method returns an `AsyncIterator` to observe the agent's progress.

```typescript
for await (const activity of session.stream()) {
  switch (activity.type) {
    case 'planGenerated':
      console.log(
        'Plan:',
        activity.plan.steps.map((s) => s.title),
      );
      break;
    case 'agentMessaged':
      console.log('Agent says:', activity.message);
      break;
    case 'sessionCompleted':
      console.log('Session complete!');
      break;
  }
}
```

### Code Diffs, Shell Output, and Media Artifacts

Activities can contain artifacts: code changes (`changeSet`), shell output (`bashOutput`), or images (`media`).

```typescript
for (const artifact of activity.artifacts) {
  if (artifact.type === 'bashOutput') {
    console.log(artifact.toString());
  }
  if (artifact.type === 'changeSet') {
    const parsed = artifact.parsed();
    for (const file of parsed.files) {
      console.log(`${file.path}: +${file.additions} -${file.deletions}`);
    }
  }
  if (artifact.type === 'media' && artifact.format === 'image/png') {
    await artifact.save(`./screenshots/${activity.id}.png`);
  }
}
```

### SDK Configuration

The default `jules` instance looks for the environment variable `JULES_API_KEY`. If you need to set an API key in code or create multiple instances, use the `with` method.

```typescript
import { jules } from '@google/jules-sdk';

// Multiple API keys
const customJules = jules.with({ apiKey: 'other-api-key' });

// Polling & timeouts
const customJules = jules.with({
  pollingIntervalMs: 2000,
  timeout: 60000,
});
```

### Error Handling

The SDK provides multiple error types that inherit from `JulesError`.

```typescript
import {
  jules,
  JulesError,
  JulesNetworkError,
  JulesApiError,
  JulesRateLimitError,
  MissingApiKeyError
} from '@google/jules-sdk';

try {
  const session = await jules.session({ ... });
} catch (error) {
  if (error instanceof JulesError) {
    console.error(`SDK error: ${error.message}`);
  }
}
```

### Agent Sources

Each agent session has a `source` property that defines what the source context is used for the session. This is primarily a GitHub repository, but sessions can also run without a source and use only the context passed in the prompt.

```typescript
// List all connected sources
for await (const source of jules.sources()) {
  if (source.type === 'githubRepo') {
    console.log(`${source.githubRepo.owner}/${source.githubRepo.repo}`);
    console.log(`  Private: ${source.githubRepo.isPrivate}`);
  }
}

// Get a specific source
const myRepo = await jules.sources.get({ github: 'my-org/my-project' });
if (myRepo) {
  console.log(`Found: ${myRepo.id}`);
}
```

### API Overview

- **Core:**
  - `jules`: The pre-initialized client.
  - `jules.with(options)`: Creates a new client with custom configuration.
  - `jules.run(options)`: Creates an automated session.
  - `jules.session(options)`: Creates or rehydrates an interactive session.
  - `jules.all(items, mapFn, options)`: Batch processing.
- **Session Control:**
  - `session.ask()`: Sends a message and awaits the agent's reply.
  - `session.send()`: Sends a fire-and-forget message.
  - `session.approve()`: Approves a pending plan.
  - `session.waitFor()`: Pauses until the session reaches a specific state.
  - `session.result()`: Awaits the final outcome.
- **Observation:**
  - `session.stream()`: Async iterator of all activities.
  - `session.history()`: Stream of cached activities.
  - `session.updates()`: Stream of live activities.
  - `session.select(query)`: Query local cache.
  - `session.info()`: Fetch latest session state.
- **Artifacts:**
  - `artifact.save()`: Save to filesystem.
  - `artifact.toUrl()`: Get data URI.
  - `artifact.toString()`: Formatted output for bash artifacts.
  - `artifact.parsed()`: Structured diff parsing for changesets.
- **Sources:**
  - `jules.sources()`: Async iterator over all connected sources.
  - `jules.sources.get(filter)`: Retrieve a specific source by identifier.

## License

Apache-2.0

> **Note:** This is not an officially supported Google product. This project is not eligible for the [Google Open Source Software Vulnerability Rewards Program](https://bughunters.google.com/open-source-security).
