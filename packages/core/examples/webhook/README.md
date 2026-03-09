# Webhook Integration Example

This example demonstrates how to create a simple webhook server using [Hono](https://hono.dev/) that listens for incoming HTTP `POST` requests and automatically creates a new Jules session.

This is particularly useful for event-driven workflows, such as automatically running an agent when a specific event occurs in another system (e.g., a GitHub issue being created, a new row added to a database, or a custom application event).

## Prerequisites

- Ensure you have [Bun](https://bun.sh/) installed, or another compatible runtime like Node.js.
- Ensure you have your `JULES_API_KEY` set as an environment variable.

## Running the Example

1. Start the webhook server:

   ```bash
   bun install
   bun run index.ts
   ```

2. The server will start and listen on port `3000`.

3. Send a test webhook payload using `curl` (or your preferred tool like Postman):

   ```bash
   curl -X POST http://localhost:3000/webhook \
     -H "Content-Type: application/json" \
     -d '{"event": "bug_report", "description": "Fix typo in README"}'
   ```

4. Check the server console logs. You should see the incoming payload and the ID of the newly created Jules session.

## Notes

- In a real-world scenario, you should validate the incoming webhook payload to ensure it comes from a trusted source (e.g., verifying a signature or secret token).
- You can customize the `prompt` and `source` in `index.ts` to match your specific requirements and target repository.
