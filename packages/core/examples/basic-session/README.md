# Basic Session Example

This example demonstrates how to use the Jules SDK to create a simple interactive session. It will use the `jules.session` method to connect to the Jules API, create a session without a specific repository context (a "Repoless" session), provide a prompt to an AI agent, and wait for the results.

## Requirements

- Node.js >= 18 or Bun
- A Jules API Key (`JULES_API_KEY` environment variable)

## Setup

1. Make sure you have installed the SDK dependencies in the project root.

2. Export your Jules API key:

```bash
export JULES_API_KEY="your-api-key-here"
```

## Running the Example

Using `bun`:

```bash
bun run index.ts
```

Using `npm` and `tsx` (or similar TypeScript runner):

```bash
npx tsx index.ts
```

## What it does

The script creates a session using `jules.session` and asks the agent to write a haiku. It then waits for the result and retrieves the output. This is a basic demonstration of the isolated core Jules API.
