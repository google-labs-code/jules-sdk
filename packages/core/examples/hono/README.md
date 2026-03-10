# Hono Integration Example

This example demonstrates how to integrate the Jules SDK with a [Hono](https://hono.dev/) backend application. It shows how to expose a lightweight API to manage and monitor long-running agent sessions.

## Features Illustrated

1. **Creating Sessions**: A POST endpoint to create a new session based on user input.
2. **Checking Status**: A GET endpoint to retrieve the latest state and information for an ongoing session.
3. **Streaming Activities**: An endpoint using Server-Sent Events (SSE) to forward the agent's progress stream to the client in real time.

## Requirements

- Bun
- A Jules API Key (`JULES_API_KEY` environment variable)

## Setup

1. Install dependencies from the monorepo root:

   ```bash
   bun install
   ```

2. Export your Jules API key:

   ```bash
   export JULES_API_KEY="your-api-key-here"
   ```

## Running the Example

Start the Hono server:

```bash
bun start
# or bun dev for hot reloading
```

The server will be running on `http://localhost:3000`.

## Testing the Endpoints

### 1. Create a session

You can initiate a basic Repoless session by POSTing a prompt to `/api/sessions/create`.

```bash
curl -X POST http://localhost:3000/api/sessions/create \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Write a short poem about the ocean"}'
```

**Expected Response:**

```json
{
  "message": "Session created successfully",
  "sessionId": "123456789...",
  "status": "inProgress"
}
```

### 2. Check session status

Once you have a session ID, you can fetch its current state via the status endpoint.

```bash
curl http://localhost:3000/api/sessions/<your-session-id>/status
```

**Expected Response:**

```json
{
  "sessionId": "123456789...",
  "state": "completed",
  "createdAt": "2023-10-27T10:00:00Z"
}
```

### 3. Stream session activities

You can listen for real-time updates from an ongoing session using Server-Sent Events (SSE).

```bash
curl -N http://localhost:3000/api/sessions/<your-session-id>/stream
```

**Expected Output (Stream):**

```text
data: {"type":"sessionStarted","timestamp":"2023-10-27T10:00:00Z","summary":"Session started"}

data: {"type":"agentMessaged","timestamp":"2023-10-27T10:00:05Z","message":"Here is the poem...","summary":"Agent replied"}

event: done
data: Session completed
```