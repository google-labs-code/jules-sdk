# Local Query Engine (JQL)

The Jules SDK includes a powerful local query engine that allows you to filter and project session data cached on your machine. This is faster than making API calls for every operation and enables complex queries not supported by the raw API.

## Overview

The SDK automatically caches session data locally. You can query this data using a MongoDB-like syntax.

The query method is `jules.select(query)`.

## Querying Sessions

To find sessions, set `from: 'sessions'`.

```typescript
const failedSessions = await jules.select({
  from: 'sessions',
  where: { state: 'failed' },
  limit: 10
});
```

## Querying Activities

To find specific activities across all sessions (or a specific one), set `from: 'activities'`.

```typescript
// Find all "bashOutput" artifacts where the command failed
const errors = await jules.select({
  from: 'activities',
  where: {
    'artifacts.type': 'bashOutput',
    'artifacts.exitCode': { $gt: 0 }
  }
});
```

## Filtering (`where`)

The `where` clause supports exact matches and operators.

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `$eq` | Equal to (default) | `{ state: 'completed' }` |
| `$neq` | Not equal to | `{ state: { $neq: 'failed' } }` |
| `$gt` | Greater than | `{ durationMs: { $gt: 5000 } }` |
| `$lt` | Less than | `{ createTime: { $lt: '2023-01-01' } }` |
| `$in` | In array | `{ state: { $in: ['queued', 'planning'] } }` |
| `$contains` | String contains (case-insensitive) | `{ prompt: { $contains: 'refactor' } }` |

### Examples

```typescript
// Find sessions created after a certain date
const recent = await jules.select({
  from: 'sessions',
  where: { createTime: { $gt: '2023-10-27T00:00:00Z' } }
});

// Find sessions with "test" in the prompt
const tests = await jules.select({
  from: 'sessions',
  where: { prompt: { $contains: 'test' } }
});
```

## Projections (`select`)

Use `select` to return only specific fields. This improves performance and reduces memory usage.

```typescript
const summaries = await jules.select({
  from: 'sessions',
  select: ['id', 'title', 'state']
});

// Result: [{ id: '...', title: '...', state: '...' }, ...]
```

## Ordering and Limits

Control the result set with `order` and `limit`.

```typescript
const latest = await jules.select({
  from: 'sessions',
  order: 'desc', // Sort by createTime descending (default)
  limit: 5
});
```

## Syncing Data

The local query engine relies on cached data. To ensure your cache is up-to-date with the server, use `jules.sync()`.

```typescript
// Standard sync (fetches metadata for recent sessions)
const stats = await jules.sync();
console.log(`Synced ${stats.sessionsIngested} sessions.`);

// Deep sync (fetches all activities for sessions)
await jules.sync({ depth: 'activities' });

// Continuous sync (keep cache updated)
setInterval(() => jules.sync(), 60000);
```

### Sync Options

```typescript
interface SyncOptions {
  limit?: number;       // Max sessions to fetch
  depth?: 'metadata' | 'activities';
  incremental?: boolean; // Stop when known data is reached (default: true)
  concurrency?: number;  // Parallel downloads
}
```
