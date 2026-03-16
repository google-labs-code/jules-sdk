# Concurrent Sessions

Runs multiple Jules sessions in parallel using `jules.all()` with configurable concurrency and fault tolerance.

## Quick Start

```bash
export JULES_API_KEY="your-api-key"
bun run index.ts
```

## Batch Creation with `jules.all()`

Dispatches three tasks and maps each to session options:

```typescript
const sessions = await jules.all(
  tasks,
  (task) => ({ prompt: task }),
  { concurrency: 2, stopOnError: false },
);
```

- `concurrency: 2` — at most 2 sessions created at a time
- `stopOnError: false` — if one task fails, the rest continue
- The mapper transforms each string into `{ prompt }` session options

## Parallel Streaming

After creation, all sessions stream concurrently:

```typescript
await Promise.all(sessions.map(streamSession));
```

Each session independently iterates `session.stream()` and fires a non-blocking `session.result()` handler.
