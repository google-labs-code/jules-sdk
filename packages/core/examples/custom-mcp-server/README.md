# Custom MCP Server

An MCP server that exposes a `session_analysis` tool for analyzing Jules sessions. Given a session ID, it retrieves the session state, streams through all activities, collects the history, and returns a structured summary including activity count, generated files, and the last agent message.

## Quick Start

```bash
npm install
export JULES_API_KEY="your-api-key"
bun run start
```

Starts an MCP server on stdio transport.

## `session_analysis` Tool

Given a session ID, the handler:

1. Reconnects to the session with `jules.session(sessionId)`
2. Fetches session info with `session.info()` for current state
3. Iterates `session.stream()` to collect the full activity history
4. Calls `session.snapshot()` for generated file counts
5. Returns a structured summary

```typescript
const session = jules.session(input.sessionId);
const outcome = await session.info();

const history = [];
for await (const activity of session.stream()) {
  history.push(activity);
}

const snapshot = await session.snapshot();
```

Errors (including `JulesApiError`) are caught and returned as typed error results instead of throwing.

## Connecting to the Server

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "jules-analysis": {
      "command": "bun",
      "args": ["run", "/path/to/examples/custom-mcp-server/src/index.ts"],
      "env": { "JULES_API_KEY": "your-key" }
    }
  }
}
```

## Typed Service Contract Pattern

| File | Purpose |
|------|---------|
| `src/commands/session-analysis/spec.ts` | Zod schemas: `SessionAnalysisInput`, `SessionAnalysisResult` |
| `src/commands/session-analysis/handler.ts` | `SessionAnalysisHandler` — reconnects, streams, analyzes |
| `src/index.ts` | MCP server setup with `registerTool()` |
