# Hono Integration

Hono backend with three endpoints covering the main Jules API patterns: session creation, status checking, and activity streaming via Server-Sent Events.

## Quick Start

```bash
npm install
export JULES_API_KEY="your-api-key"
bun run index.ts
```

Server starts on `http://localhost:3000`.

## Session Creation

`POST /api/sessions/create` — accepts a prompt, creates a repoless session, and returns the session ID and initial state.

```bash
curl -X POST http://localhost:3000/api/sessions/create \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Write a Python hello world script"}'
```

Uses `jules.session({ prompt })` and fetches metadata with `session.info()`.

## Session Status by ID

`GET /api/sessions/:id/status` — reconnects to an existing session with `jules.session(sessionId)` and returns its current state and creation time.

```bash
curl http://localhost:3000/api/sessions/SESSION_ID/status
```

## Activity Streaming via SSE

`GET /api/sessions/:id/stream` — iterates `session.stream()` and forwards each activity as a Server-Sent Event using Hono's `streamSSE()`.

```bash
curl -N http://localhost:3000/api/sessions/SESSION_ID/stream
```

Each event contains the activity type, timestamp, and type-specific fields (e.g., `message` for `agentMessaged`). A `done` event fires on completion.

From a browser:
```javascript
const source = new EventSource('/api/sessions/SESSION_ID/stream');
source.onmessage = (e) => console.log(JSON.parse(e.data));
```