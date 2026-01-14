# SessionClient.snapshot() Specification

> **Status**: Implemented  
> **Last Updated**: 2026-01-02  
> **Purpose**: Define expected behavior for `session.snapshot()` to enable comprehensive session analysis

---

## Overview

The `snapshot()` method creates a **point-in-time view** of a session with all activities loaded and derived analytics computed. It is a network operation with cache heuristics.

```typescript
snapshot(): Promise<SessionSnapshot>
```

---

## Table of Contents

1. [Function Signature](#1-function-signature)
2. [Core Behaviors](#2-core-behaviors)
3. [Network/Cache Strategy](#3-networkcache-strategy)
4. [Computed Views](#4-computed-views)
5. [Serialization](#5-serialization)
6. [MCP Integration](#6-mcp-integration)
7. [Test Cases](#7-test-cases)

---

## 1. Function Signature

### Output: `SessionSnapshot`

```typescript
interface SessionSnapshot {
  // Identity
  readonly id: string;
  readonly state: SessionState;
  readonly url: string;

  // Timing
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly durationMs: number;

  // Content
  readonly prompt: string;
  readonly title: string;
  readonly pr?: PullRequest;

  // Activities (raw)
  readonly activities: readonly Activity[];

  // Computed views
  readonly activityCounts: Readonly<Record<Activity['type'], number>>;
  readonly timeline: readonly TimelineEntry[];

  // Insights
  readonly insights: SessionInsights;

  // Serialization
  toJSON(): SerializedSnapshot;
  toMarkdown(): string;
}
```

### Supporting Types

```typescript
interface TimelineEntry {
  readonly time: string; // ISO timestamp
  readonly type: Activity['type'];
  readonly summary: string;
}

interface SessionInsights {
  readonly completionAttempts: number; // sessionCompleted events
  readonly planRegenerations: number; // planGenerated events
  readonly userInterventions: number; // userMessaged events
  readonly failedCommands: readonly Activity[]; // bashOutput with exitCode !== 0
}

interface SerializedSnapshot {
  id: string;
  state: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  durationMs: number;
  prompt: string;
  title: string;
  activities: Activity[];
  activityCounts: Record<string, number>;
  timeline: TimelineEntry[];
  insights: {
    completionAttempts: number;
    planRegenerations: number;
    userInterventions: number;
    failedCommandCount: number;
  };
  pr?: { url: string; title: string; description: string };
}
```

---

## 2. Core Behaviors

| ID      | Behavior                                                          | Status      |
| ------- | ----------------------------------------------------------------- | ----------- |
| SNAP-01 | `snapshot()` returns a SessionSnapshot with all activities loaded | implemented |
| SNAP-02 | `snapshot()` is immutable - represents point-in-time state        | implemented |
| SNAP-03 | Multiple calls return independent snapshot instances              | implemented |
| SNAP-04 | Snapshot includes all activities from `history()`                 | implemented |
| SNAP-05 | Snapshot includes session info from `info()`                      | implemented |

---

## 3. Network/Cache Strategy

`snapshot()` is a **network operation with cache heuristics**. Internally it calls:

- `info()` - uses existing session caching
- `history()` - uses existing activity caching

| ID     | Behavior                                                   | Status      |
| ------ | ---------------------------------------------------------- | ----------- |
| NET-01 | Uses `info()` for session data (inherits cache heuristic)  | implemented |
| NET-02 | Uses `history()` for activities (inherits cache heuristic) | implemented |
| NET-03 | Both calls happen in parallel (`Promise.all`)              | implemented |
| NET-04 | No additional network calls beyond `info()` + `history()`  | implemented |

---

## 4. Computed Views

### 4.1 Timeline Generation

| ID    | Behavior                                            | Status      |
| ----- | --------------------------------------------------- | ----------- |
| TL-01 | Each activity maps to one timeline entry            | implemented |
| TL-02 | `time` is ISO string from `activity.createTime`     | implemented |
| TL-03 | `type` matches `activity.type`                      | implemented |
| TL-04 | `summary` is human-readable description of activity | implemented |

### Summary Generation Rules

| Activity Type      | Summary Format                                                    |
| ------------------ | ----------------------------------------------------------------- |
| `planGenerated`    | `"Plan with {N} steps"`                                           |
| `planApproved`     | `"Plan approved"`                                                 |
| `progressUpdated`  | `activity.title` or `activity.description` or `"Progress update"` |
| `sessionCompleted` | `"Session completed"`                                             |
| `sessionFailed`    | `"Failed: {error.message}"`                                       |
| `userMessaged`     | `"User: {first 100 chars}..."`                                    |
| `agentMessaged`    | `"Agent: {first 100 chars}..."`                                   |
| (default)          | `activity.type`                                                   |

### 4.2 Activity Counts

| ID    | Behavior                                     | Status      |
| ----- | -------------------------------------------- | ----------- |
| AC-01 | Counts map activity type to occurrence count | implemented |
| AC-02 | All observed types are included              | implemented |
| AC-03 | Types with 0 occurrences are omitted         | implemented |

### 4.3 Insights Computation

| ID     | Behavior                                                       | Status      |
| ------ | -------------------------------------------------------------- | ----------- |
| INS-01 | `completionAttempts` = count of `sessionCompleted` activities  | implemented |
| INS-02 | `planRegenerations` = count of `planGenerated` activities      | implemented |
| INS-03 | `userInterventions` = count of `userMessaged` activities       | implemented |
| INS-04 | `failedCommands` = activities with `bashOutput.exitCode !== 0` | implemented |

---

## 5. Serialization

| ID     | Behavior                                               | Status      |
| ------ | ------------------------------------------------------ | ----------- |
| SER-01 | `toJSON()` returns plain object (no methods)           | implemented |
| SER-02 | Output is JSON.stringify-safe                          | implemented |
| SER-03 | Dates are serialized as ISO strings                    | implemented |
| SER-04 | `failedCommands` becomes `failedCommandCount` (number) | implemented |

### 5.2 Markdown Output

| ID    | Behavior                                                  | Status      |
| ----- | --------------------------------------------------------- | ----------- |
| MD-01 | `toMarkdown()` returns formatted summary with sections    | implemented |
| MD-02 | Markdown includes Timeline, Insights, and Errors sections | implemented |

---

## 6. MCP Integration

A new MCP tool `jules_analyze_session` exposes snapshot functionality.

### Tool Definition

```typescript
{
  name: 'jules_analyze_session',
  description: 'Returns full analysis of a session including timeline, activity counts, and insights.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'The session ID to analyze' },
    },
    required: ['sessionId'],
  },
}
```

| ID     | Behavior                                            | Status  |
| ------ | --------------------------------------------------- | ------- |
| MCP-01 | `jules_analyze_session` returns `snapshot.toJSON()` | pending |
| MCP-02 | Invalid session ID returns error                    | pending |
| MCP-03 | Output is valid JSON in MCP response format         | pending |

### 6.2 Prompt Resources

The MCP server exposes prompt templates to enable client-side inference.

**Prompt: `analyze_session`**

- **Arguments**: `sessionId`
- **Behavior**: Retrieves session snapshot and injects it into the `context/session-analysis.md` template.
- **Output**: A single user message containing the analysis instructions and the full JSON snapshot.

| ID     | Behavior                                                  | Status  |
| ------ | --------------------------------------------------------- | ------- |
| PRM-01 | `list_prompts` returns `analyze_session`                  | pending |
| PRM-02 | `get_prompt` with valid `sessionId` returns template+JSON | pending |
| PRM-03 | Missing `sessionId` throws error                          | pending |

### 6.3 Tools

Exposes analysis capabilities for autonomous agents.

**Tool: `jules_get_session_analysis_context`**

- **Purpose**: Retrieve full session analysis context (snapshot + instructions) for the agent to self-diagnose.
- **Input**: `{ sessionId: string }`
- **Output**: `{ content: [{ type: 'text', text: "..." }] }` (Markdown)

| ID      | Behavior                                       | Status |
| ------- | ---------------------------------------------- | ------ |
| TOOL-01 | `call_tool` returns formatted analysis context | passed |
| TOOL-02 | `call_tool` throws if sessionId missing        | passed |

## 7. Test Cases

See [spec/snapshot/cases.yaml](./snapshot/cases.yaml) for machine-readable test cases.

---

## Implementation Status

### ✅ Completed Features

The `SessionSnapshot` feature is **fully implemented** in `src/snapshot.ts`:

- **Core Snapshot** (`SessionSnapshotImpl`)
  - All properties (id, state, url, dates, activities, etc.)
  - Immutability (Object.freeze)
  - Independent instances on each call

- **Network Strategy**
  - Parallel `Promise.all([info(), history()])`
  - Leverages existing cache heuristics from both methods

- **Computed Views**
  - **Timeline**: Maps activities to human-readable summaries
  - **Activity Counts**: Aggregates by activity type
  - **Insights**: Calculates completion attempts, plan regenerations, user interventions, and failed commands

- **Serialization**
  - `toJSON()`: Plain object with ISO date strings
  - `toMarkdown()`: Formatted report with Overview, Insights, Timeline, and Activity Counts

### 🔨 MCP Integration Status

- ✅ **Prompts**: `analyze_session` prompt (implemented, tested)
- ✅ **Tools**: `jules_get_session_analysis_context` tool (implemented, tested)
- ⏸️ **Tests**: Core snapshot tests not yet written (spec test cases pending)

### Next Steps

1. Write comprehensive test suite for `SessionSnapshot` covering all 20+ behaviors
2. Add edge case tests (empty sessions, missing data, etc.)
3. Performance testing for large sessions (1000+ activities)
