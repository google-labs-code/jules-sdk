# Webhook Handler

Minimal server that creates a Jules session whenever it receives an HTTP POST. Built with Hono — accepts any JSON payload and embeds it in the session prompt.

## Quick Start

```bash
npm install
export JULES_API_KEY="your-api-key"
bun run index.ts
```

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"event": "bug_report", "description": "Fix typo in README"}'
```

## Payload-Driven Session Creation

The `/webhook` endpoint serializes the entire payload into the prompt via `JSON.stringify(payload)` and creates a session targeting a default GitHub repo. Returns the session ID immediately.

## Production Considerations

- Add webhook signature verification (e.g., GitHub's `X-Hub-Signature-256`)
- Derive the target repo from the payload instead of hardcoding
- Tailor the prompt template based on event type
