# Express Integration

REST API that wraps Jules session creation in an Express endpoint. Fire-and-forget — creates a session and returns the ID immediately.

## Quick Start

```bash
npm install
export JULES_API_KEY="your-api-key"
export PORT=3000  # optional, defaults to 3000
bun run index.ts
```

Starts the server, runs a self-test request, and shuts down.

## `POST /api/jules` Endpoint

```bash
curl -X POST http://localhost:3000/api/jules \
  -H "Content-Type: application/json" \
  -d '{"githubUrl": "owner/repo", "taskDescription": "Fix the login bug"}'
```

Returns `{ "sessionId": "abc123" }`. The session runs in the background — the client doesn't wait for completion.

## Middleware and Self-Test

A middleware layer on `/api` validates that `JULES_API_KEY` is set, returning 500 early if missing.

When run directly, the script detects it via `import.meta.url`, starts the server, fires a test POST, logs the result, and shuts down. The app is also exported (`export default app`) so it can be imported as a module in larger applications.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JULES_API_KEY` | Yes | — | API key |
| `PORT` | No | `3000` | Server port |
