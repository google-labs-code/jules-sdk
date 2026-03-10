# Cloudflare Workers Example

This example demonstrates how to use the Jules SDK within a Cloudflare Worker environment. By intercepting incoming HTTP `POST` requests, the worker can automatically trigger and orchestrate a new coding session through the `@google/jules-sdk`.

This is especially useful for edge-based event processing (e.g., handling incoming webhooks from external services like Stripe or GitHub directly at the edge) and kicking off agent workflows globally without dedicated infrastructure.

## Prerequisites

- Ensure you have [Bun](https://bun.sh/) installed, or another compatible runtime like Node.js.
- Ensure your `JULES_API_KEY` is set as an environment variable in your local shell or your Cloudflare environment bindings.

## Running the Example Locally

The example uses a mocked entry point for the Cloudflare worker module via `index.ts`. To ensure it builds and can run basic checks in the monorepo context:

1. Build the module:

   ```bash
   bun run build
   ```

2. To run the handler script as a standard Bun process (noting it simulates the Worker `fetch` function structure):

   ```bash
   bun run start
   ```

*(Note: While `bun run start` simply executes `index.ts`, a true worker testing environment typically requires `wrangler` and a test server setup. This simple repository example demonstrates the SDK's structural integration.)*

## Notes

- In a real-world Cloudflare deployment, the `JULES_API_KEY` should be set via Cloudflare secrets using `wrangler secret put JULES_API_KEY`. It would be available on the `env` object inside the `fetch` handler.
- If your environment provides the API key via `env.JULES_API_KEY` rather than the global `process.env`, you can customize the instantiation using `jules.with({ apiKey: env.JULES_API_KEY })`.
- Make sure to modify the target `source` in `index.ts` to match the specific GitHub repository or branching strategy your worker intends to automate.
