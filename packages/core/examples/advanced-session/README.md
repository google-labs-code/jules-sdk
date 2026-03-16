# Advanced Session

Adds interactive workflow control on top of a basic session — waiting for a plan, approving it programmatically, and querying cached activities after the session completes.

## Quick Start

```bash
export JULES_API_KEY="your-api-key"
bun run index.ts
```

## Plan Approval Flow

The agent generates a plan before executing. `waitFor()` blocks until the plan is ready, then `approve()` gives the green light:

```typescript
await session.waitFor('awaitingPlanApproval');
console.log('Plan ready. Approving...');
await session.approve();
```

This is the human-in-the-loop checkpoint. In production you'd inspect `plan.steps` before approving.

## Querying Cached Activities

Once streaming fills the local activity cache, `jules.select()` queries it without additional API calls:

```typescript
const messages = await jules.select({
  from: 'activities',
  where: { type: 'agentMessaged', sessionId: session.id },
  order: 'desc',
  limit: 3,
});
```

Returns the 3 most recent agent messages from the local store. Useful for post-session analytics or extracting specific outputs.

## Key Files

| File | Purpose |
|------|---------|
| `index.ts` | Plan approval, streaming, and `jules.select()` queries |
| `../_shared/log-stream.ts` | Typed stream handler |
| `../_shared/check-env.ts` | Env validation |
