# Custom CLI Tools Example

This example demonstrates how to use the Jules SDK to create a custom command-line interface (CLI) tool. The tool takes a user prompt as an argument, uses a "Repoless" session to execute the task, and prints the generated output.

## Requirements

- Node.js >= 18 or Bun
- A Jules API Key (`JULES_API_KEY` environment variable)

## Setup

1. Make sure you have installed the SDK dependencies in the project root by running `bun install`.
2. Build the SDK in `packages/core` by running `npm run build` inside the `packages/core` directory.

3. Export your Jules API key:

```bash
export JULES_API_KEY="your-api-key-here"
```

## Running the Example

You can run the CLI tool using `bun` and passing your prompt as an argument:

```bash
bun run index.ts "Translate 'Hello, how are you?' into French."
```

Using `npm` and `tsx` (or similar TypeScript runner):

```bash
npx tsx index.ts "What is the capital of Australia?"
```

## What it does

The script parses `process.argv` to get the user's prompt, creates a session using `jules.session`, and waits for the agent to complete. Once complete, it retrieves the generated files and the agent's messages, effectively acting as a simple, custom AI CLI tool powered by Jules.
