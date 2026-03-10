# Cron Jobs Example

This example demonstrates how to trigger a Jules session from a scheduled cron job using [node-cron](https://www.npmjs.com/package/node-cron).

This approach is highly useful for scheduling automated tasks such as:
- Nightly code reviews.
- Scheduled repo cleanups.
- Regular synchronization tasks.

## Prerequisites

- Ensure you have [Bun](https://bun.sh/) installed, or another compatible runtime like Node.js.
- Ensure your `JULES_API_KEY` is set as an environment variable.

## Running the Example

1. Navigate to the example directory and install dependencies:

   ```bash
   bun install
   ```

2. Start the scheduled cron job. By default, the script triggers a repoless session every minute.

   ```bash
   export JULES_API_KEY="your-api-key"
   bun run start
   ```

3. The script will output its progress to the console every minute as the cron job fires and starts a session. You can stop it at any time using `Ctrl+C`.

## Customizing

You can modify the cron schedule in `index.ts` to suit your needs:

```typescript
// Example: run every night at midnight
cron.schedule('0 0 * * *', runTask);
```
