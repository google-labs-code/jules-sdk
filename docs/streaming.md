# Streaming and Activity Monitoring

Jules provides a real-time streaming API to observe the agent's progress. This allows you to build responsive UIs or CLI tools that react to every action the agent takes.

## Stream Methods

The `SessionClient` exposes three methods for accessing activities:

### 1. `session.stream()` (Recommended)

The main entry point for observation. It streams all activities, including past history and future updates.

```typescript
for await (const activity of session.stream()) {
  console.log(activity.type);
}
```

### 2. `session.history()`

Yields only past activities from the local cache or network history. It ends immediately after the last known activity.

```typescript
// Replay past events
for await (const activity of session.history()) {
  renderActivity(activity);
}
```

### 3. `session.updates()`

Yields only *future* activities as they happen. It blocks until new events arrive.

```typescript
// Wait for new events
for await (const activity of session.updates()) {
  notifyUser(activity);
}
```

## Activity Types

Activities are discriminated unions, meaning they share common fields but have unique properties based on their `type`.

| Type | Description | Key Properties |
|------|-------------|----------------|
| `planGenerated` | The agent has created a plan | `plan` |
| `progressUpdated` | The agent is working on a step | `title`, `description` |
| `agentMessaged` | The agent sent a message | `message` |
| `userMessaged` | The user sent a message | `message` |
| `sessionCompleted` | The session finished successfully | - |
| `sessionFailed` | The session encountered a fatal error | `reason` |
| `planApproved` | The user approved the plan | `planId` |

## Type-Safe Event Handling

Use a `switch` statement on `activity.type` to narrow the type and access specific properties safely.

```typescript
for await (const activity of session.stream()) {
  switch (activity.type) {
    case 'planGenerated':
      // TypeScript knows this is an ActivityPlanGenerated
      console.log('Steps:', activity.plan.steps.map(s => s.title));
      break;

    case 'agentMessaged':
      // TypeScript knows this is an ActivityAgentMessaged
      console.log('Agent:', activity.message);
      break;

    case 'progressUpdated':
      console.log('Working on:', activity.title);
      break;

    case 'sessionFailed':
      console.error('Error:', activity.reason);
      break;
  }
}
```

## Combining Streams

You can manually combine `history()` and `updates()` if you need precise control over the UI rendering lifecycle (e.g., rendering initial state then switching to live mode).

```typescript
// 1. Initial Load
const activities = [];
for await (const activity of session.history()) {
  activities.push(activity);
}
renderInitialList(activities);

// 2. Live Updates
for await (const activity of session.updates()) {
  activities.push(activity);
  appendToList(activity);
}
```

## Filtering Streams

You can filter the stream to exclude certain activities, such as those originating from the user.

```typescript
const stream = session.stream({
  exclude: { originator: 'user' }
});

for await (const activity of stream) {
  // Will not see 'userMessaged' activities here
}
```
