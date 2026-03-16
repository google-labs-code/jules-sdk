# Basic Session

Creates a repoless Jules session (no GitHub repository) and streams the agent's response in real time. The simplest starting point for the SDK — 25 lines covering session creation, streaming, and result handling.

## Quick Start

```bash
export JULES_API_KEY="your-api-key"
bun run index.ts
```

## Non-blocking Result Handling

`session.result()` returns a promise that resolves when the session finishes. Calling `.then()` on it lets you collect the final state (PR URL, generated files) without blocking the activity stream:

```typescript
session.result().then(outcome => {
  console.log(`State: ${outcome.state}`);
  console.log(`PR: ${outcome.pullRequest?.url ?? 'none'}`);
  console.log(`Files: ${outcome.generatedFiles().all().length}`);
});
```

## Typed Activity Streaming

`logStream()` subscribes to session events using a handler map. Each key is an activity type, each value is a callback with the correct type narrowed automatically:

```typescript
await logStream(session, {
  agentMessaged: (a) => console.log(`Agent: ${a.message}`),
  progressUpdated: (a) => console.log(`Progress: ${a.title}`),
  planGenerated: (a) => console.log(`Plan: ${a.plan.steps.length} steps`),
  sessionCompleted: () => console.log('Done!'),
});
```

Unspecified activity types are silently ignored — no switch statements needed. This pattern comes from the shared `_shared/log-stream.ts` helper, which wraps `session.stream()`.

## Key Files

| File | Purpose |
|------|---------|
| `index.ts` | Session creation, result handling, streaming |
| `../_shared/log-stream.ts` | `logStream()` — typed handler map over `session.stream()` |
| `../_shared/check-env.ts` | Guards against missing `JULES_API_KEY` |