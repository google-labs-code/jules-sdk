# Session Snapshots

A `SessionSnapshot` is a point-in-time, immutable view of a session with all activities loaded and derived analytics computed. It provides a convenient way to serialize session data for logging, debugging, or transmission to other systems.

## Creating a Snapshot

```typescript
import { jules } from '@google/jules-sdk';

const session = jules.session('existing-session-id');

// Create a snapshot with activities loaded
const snapshot = await session.snapshot({ activities: true });

// Or without activities (lighter weight)
const lightSnapshot = await session.snapshot({ activities: false });
```

## Serializing with `toJSON()`

The `toJSON()` method converts the snapshot to a JSON-serializable object. It supports **type-safe field masking** to control which fields are included in the output.

### Default Behavior

By default, `toJSON()` excludes the heaviest fields (`activities` and `generatedFiles`) to keep the output lightweight:

```typescript
const output = snapshot.toJSON();

// Included by default:
console.log(output.id);             // "abc123"
console.log(output.state);          // "completed"
console.log(output.title);          // "Fix login bug"
console.log(output.timeline);       // [{ time: "...", type: "planGenerated", ... }]
console.log(output.activityCounts); // { planGenerated: 1, progressUpdated: 5, ... }
console.log(output.insights);       // { completionAttempts: 1, ... }

// Excluded by default:
console.log(output.activities);     // undefined
console.log(output.generatedFiles); // undefined
```

### Using `include` (Whitelist)

Use `include` to specify exactly which fields you want. This is ideal for token-efficient responses:

```typescript
const minimal = snapshot.toJSON({
  include: ['id', 'state', 'title', 'durationMs']
});

// Only these fields are present:
console.log(minimal.id);        // "abc123"
console.log(minimal.state);     // "completed"
console.log(minimal.title);     // "Fix login bug"
console.log(minimal.durationMs); // 45000

// Everything else is undefined:
console.log(minimal.activities);  // undefined
console.log(minimal.prompt);      // undefined

// Output:
// {
//   id: "abc123",
//   state: "completed",
//   title: "Fix login bug",
//   durationMs: 45000
// }
```

### Using `exclude` (Blacklist)

Use `exclude` to remove specific fields while keeping everything else:

```typescript
const lightweight = snapshot.toJSON({
  exclude: ['activities', 'generatedFiles', 'timeline']
});

// All other fields are present:
console.log(lightweight.id);             // "abc123"
console.log(lightweight.state);          // "completed"
console.log(lightweight.prompt);         // "Please fix the login button..."
console.log(lightweight.activityCounts); // { planGenerated: 1, ... }

// These fields were excluded:
console.log(lightweight.activities);     // undefined
console.log(lightweight.generatedFiles); // undefined
console.log(lightweight.timeline);       // undefined
```

### Getting the Full Snapshot

To get all fields without any masking, pass an empty options object:

```typescript
const full = snapshot.toJSON({});

console.log(full.activities?.length);      // 15 (all activities)
console.log(full.generatedFiles?.length);  // 3 (all generated files)
```

## Type Safety

The field mask is fully type-safe. TypeScript will catch invalid field names at compile time:

```typescript
// ✅ Valid field names
snapshot.toJSON({ include: ['id', 'state', 'title'] });

// ❌ Compile error: Type '"invalidField"' is not assignable to type 'SnapshotField'
snapshot.toJSON({ include: ['invalidField'] });
```

### Available Fields

The following fields are available in `SerializedSnapshot`:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Session ID |
| `state` | `string` | Current session state |
| `url` | `string` | URL to view the session |
| `createdAt` | `string` | ISO timestamp of creation |
| `updatedAt` | `string` | ISO timestamp of last update |
| `durationMs` | `number` | Duration in milliseconds |
| `prompt` | `string` | The initial prompt |
| `title` | `string` | Session title |
| `activities` | `Activity[]` | All session activities |
| `activityCounts` | `Record<string, number>` | Count by activity type |
| `timeline` | `TimelineEntry[]` | Summarized activity timeline |
| `generatedFiles` | `GeneratedFile[]` | Files created/modified |
| `insights` | `object` | Computed analytics |
| `pr` | `object \| undefined` | Pull request info if created |

## Precedence Rules

If you specify both `include` and `exclude`, **`include` takes precedence**:

```typescript
// Only 'id' and 'state' are returned; 'exclude' is ignored
snapshot.toJSON({ 
  include: ['id', 'state'], 
  exclude: ['prompt']  // ← ignored!
});
```

## Return Type

The return type is `Partial<SerializedSnapshot>`, meaning all properties are optional. Use optional chaining or null checks when accessing properties:

```typescript
const result = snapshot.toJSON({ include: ['id', 'pr'] });

// Safe access patterns:
const id = result.id ?? 'unknown';
const prUrl = result.pr?.url;
const prTitle = result.pr?.title ?? 'No PR';
```

## Markdown Output

For human-readable output, use `toMarkdown()`:

```typescript
const markdown = snapshot.toMarkdown();
console.log(markdown);

// Output:
// # Session: Fix login bug
// **Status**: `completed` | **ID**: `abc123`
//
// ## Overview
// - **Duration**: 45s
// - **Total Activities**: 15
// - **Pull Request**: [Fix login bug](https://github.com/...)
//
// ## Insights
// - **Completion Attempts**: 1
// - **Plan Regenerations**: 1
// - **User Interventions**: 0
// - **Failed Commands**: 0
//
// ## Timeline
// - **[planGenerated]** Plan with 3 steps _(2026-01-29T10:00:00Z)_
// - **[progressUpdated]** Analyzing codebase _(2026-01-29T10:00:05Z)_
// ...
```
