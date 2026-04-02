# API Reference

Additional API details not needed for primary usage but useful for advanced scenarios.

## Pagination

```typescript
for await (const session of jules.sessions({ pageSize: 25 })) {
  console.log(session.id, session.state);
}
```

`sessions()` returns a `SessionCursor` — both awaitable (first page) and async-iterable (all pages).

## Snapshots

```typescript
const snapshot = await session.snapshot({ activities: true });
const json = snapshot.toJSON();
```

## Error types

```typescript
import { JulesApiError, SourceNotFoundError } from '@google/jules-sdk';

try {
  await jules.run({ prompt: '...', source: { github: 'bad/repo' } });
} catch (e) {
  if (e instanceof SourceNotFoundError) { /* repo not connected */ }
  if (e instanceof JulesApiError) { console.error(e.status, e.message); }
}
```

## Sync options

| Option        | Default      | Description                                    |
|---------------|--------------|------------------------------------------------|
| `depth`       | `'metadata'` | `'metadata'` (sessions only) or `'activities'` |
| `limit`       | `100`        | Max sessions to process                        |
| `incremental` | `true`       | High-water-mark delta sync                     |
| `concurrency` | `3`          | Parallel activity hydration                    |
| `sessionId`   | —            | Sync a single session                          |
| `checkpoint`  | `false`      | Resume interrupted syncs                       |
| `signal`      | —            | `AbortSignal` for cancellation                 |

## Caching behavior (Iceberg strategy)

Session metadata uses a three-tier cache via `session.info()`:

- **Frozen** (>30 days): returns cache immediately, no fetch
- **Warm** (terminal + verified <24h): returns cache, no fetch
- **Hot** (active or stale): fetches from network, updates cache

Activities are different — they're immutable. Once cached, they're never
re-fetched. Storage uses append-only JSONL with byte-offset indexing.
