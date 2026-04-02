---
name: jules-sdk-development
description: >
  Behavioral rules and usage patterns for the @google/jules-sdk TypeScript
  package. Covers running coding tasks, streaming, interactive sessions,
  caching, and batch processing. Encodes critical invariants like non-blocking
  result(), cache-only select(), and immutable configuration. Use when writing
  code that integrates with the Jules API via this SDK.
---

This skill guides correct usage of `@google/jules-sdk`. Follow these rules when writing SDK code, then use the patterns below as templates.

## Rules

1. **`result()` and `stream()` are independent.** `result()` polls session state. `stream()` polls the activity feed. Neither blocks the other. Always use `stream()` to observe progress — calling `result()` alone discards all activity data silently.

2. **`select()` is cache-only.** `jules.select()` queries local disk, never the network. You must call `jules.sync()` first to populate the cache. Without a prior sync, `select()` returns an empty array — no error, no warning.

3. **`with()` never mutates.** `jules.with({ ... })` returns a new client instance. The original is unchanged. This is required for concurrent workloads — shared mutable state causes interference between parallel sessions.

4. **`session(id)` is synchronous.** When reconnecting to an existing session via `jules.session('some-id')`, no `await` is needed and no network call is made. The first network call happens when you invoke a method like `info()` or `stream()`.

5. **Always prefer `stream()` over `history()` or `updates()`.** `stream()` replays cached history, deduplicates the overlap, then switches to the live feed. If the process restarts mid-session, it fills gaps from cache automatically. `updates()` silently drops everything before the reconnection point.

6. **Activities are immutable.** Once an activity is downloaded, it never changes. The SDK caches them aggressively and never re-fetches them. This is by design — activities are event-sourced.

7. **`session()` pauses for plan approval by default. `run()` does not.** `session()` sets `requireApproval: true`, so the agent will wait at `awaitingPlanApproval` until you call `approve()`. `run()` sets `requireApproval: false` for fire-and-forget automation. Both default `autoPr: true` to auto-create a Pull Request on completion. Omit `source` to create a repoless session.

## Patterns

### Create a session and stream progress

```typescript
import { jules } from '@google/jules-sdk';

const session = await jules.session({
  prompt: 'Fix the login bug on the signup page',
  source: { github: 'my-org/my-repo', baseBranch: 'main' },
});

for await (const activity of session.stream()) {
  console.log(`[${activity.type}]`, activity.message ?? '');
}

// Non-blocking call to collect the final outcome
session.result().then((outcome) => {
  console.log(outcome.state, outcome.pullRequest?.url);
});
```

### Review a plan before the agent executes

```typescript
await session.waitFor('awaitingPlanApproval');
await session.approve();
```

### Respond to the agent mid-session

```typescript
await session.send('Also update the tests.');           // fire-and-forget
const reply = await session.ask('What is the status?'); // waits for reply
```

### Automated runs (fire-and-forget)

For tasks that don't need plan review or interaction, `run()` auto-approves and returns a lightweight handle with only `stream()` and `result()`.

```typescript
const run = await jules.run({
  prompt: 'Add unit tests for the auth module',
  source: { github: 'my-org/my-repo', baseBranch: 'main' },
});

for await (const activity of run.stream()) {
  console.log(activity.type);
}
```

### Batch tasks with concurrency control

```typescript
const sessions = await jules.all(
  tasks,
  (task) => ({ prompt: task, source: { github: 'org/repo' } }),
  { concurrency: 2, stopOnError: false },
);
```

### Sync data then query locally

```typescript
await jules.sync({ depth: 'activities', limit: 50 });

const results = await jules.select({
  from: 'activities',
  where: { type: { eq: 'agentMessaged' } },
  order: 'desc',
  limit: 10,
});
```

Sync is incremental by default — after the first call, it only fetches sessions newer than the latest cache entry.

### Derive a client for a different environment

```typescript
const staging = jules.with({
  apiKey: process.env.STAGING_KEY,
  config: { pollingIntervalMs: 2000 },
});
```

### Extract code changes from artifacts

```typescript
import { ChangeSetArtifact } from '@google/jules-sdk';

for await (const activity of session.stream()) {
  for (const artifact of activity.artifacts ?? []) {
    if (artifact instanceof ChangeSetArtifact) {
      for (const file of artifact.parse().files) {
        console.log(file.path, file.patch);
      }
    }
  }
}
```
