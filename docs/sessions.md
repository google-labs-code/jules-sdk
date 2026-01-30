# Session Management

Sessions are the core unit of work in the Jules SDK. A session represents a task or conversation with a coding agent.

## Creating Sessions

There are two primary ways to create a session:

### 1. Interactive Sessions (`jules.session`)

Use `jules.session()` when you need to interact with the agent, such as approving plans or answering questions.

```typescript
const session = await jules.session({
  prompt: 'Refactor the authentication module.',
  source: { github: 'owner/repo', baseBranch: 'main' },
  requireApproval: true // Default is true for jules.session()
});
```

### 2. Automated Sessions (`jules.run`)

Use `jules.run()` for "fire-and-forget" automation. The agent will proceed without waiting for approval unless explicitly configured otherwise.

```typescript
const run = await jules.run({
  prompt: 'Fix the linting errors in src/utils.ts',
  source: { github: 'owner/repo', baseBranch: 'main' },
  autoPr: true // Default is true for jules.run()
});
```

## Repoless Sessions

Sessions don't always need a GitHub repository. You can create a "Repoless" session to use the agent as a general-purpose cloud coding environment.

```typescript
const session = await jules.session({
  prompt: `
    Create a Python script that calculates the Fibonacci sequence
    and explain how it works.
  `
});

// The agent runs in an ephemeral VM with standard tools installed.
```

## Interactive Workflows

Interactive sessions allow you to guide the agent through the task.

### Waiting for States

Use `waitFor()` to pause execution until the session reaches a specific state.

```typescript
// Wait for the agent to generate a plan
await session.waitFor('awaitingPlanApproval');
```

### Approving Plans

If `requireApproval` is set to true, the agent will pause after generating a plan.

```typescript
// Review the plan (accessible via session.info() or stream)
const info = await session.info();
console.log('Plan:', info.activities?.find(a => a.type === 'planGenerated'));

// Approve it to continue
await session.approve();
```

### Asking and Sending Messages

You can communicate with the agent during the session.

```typescript
// Send a message without waiting for a reply
await session.send("Make sure to add unit tests.");

// Send a message and wait for the agent's response
const reply = await session.ask("What testing framework are you using?");
console.log(reply.message);
```

## Batch Processing

To run multiple sessions in parallel, use `jules.all()`. This handles concurrency control for you.

```typescript
const tasks = [
  'Fix bug A',
  'Fix bug B',
  'Update documentation'
];

const sessions = await jules.all(tasks, (task) => ({
  prompt: task,
  source: { github: 'owner/repo', baseBranch: 'main' }
}), {
  concurrency: 5,   // Max 5 parallel sessions
  stopOnError: false // Continue even if one fails
});
```

## Session Lifecycle

A session goes through several states:

- **queued**: The session is waiting to start.
- **planning**: The agent is analyzing the request and creating a plan.
- **awaitingPlanApproval**: The plan is ready and waiting for user approval.
- **inProgress**: The agent is executing the plan.
- **awaitingUserFeedback**: The agent has a question for the user.
- **completed**: The task is finished successfully.
- **failed**: The session encountered an error and stopped.

## Getting Results

Once a session is complete, you can retrieve the outcome.

```typescript
const outcome = await session.result();

if (outcome.state === 'completed') {
  // Access generated files
  const files = outcome.generatedFiles();
  const readme = files.get('README.md');

  // Access the Pull Request
  if (outcome.pullRequest) {
    console.log(`PR Created: ${outcome.pullRequest.url}`);
  }
}
```

## API Reference

### SessionConfig

```typescript
interface SessionConfig {
  prompt: string;
  source?: {
    github: string;
    baseBranch: string;
  };
  title?: string;
  requireApproval?: boolean;
  autoPr?: boolean;
}
```

### SessionOutcome

```typescript
interface SessionOutcome {
  state: 'completed' | 'failed';
  pullRequest?: { url: string; title: string };
  generatedFiles(): GeneratedFiles;
  changeSet(): ChangeSetArtifact | undefined;
  // ... other properties
}
```
