# Agent Workflow Example

This example demonstrates how to use the `jules.all()` API to create an AI agent workflow that manages multiple tasks concurrently. It orchestrates complex, long-running coding tasks to an ephemeral cloud environment.

## Overview

The example runs multiple prompts in parallel using `jules.all()`:

1. Analyzing a repository for improvements.
2. Writing an automation script.
3. Suggesting test cases.

It demonstrates how to configure concurrency, handle errors without stopping the whole process, and process the results (like reading generated files) from each session.

## Prerequisites

- Node.js or Bun installed.
- A Jules API Key. Set it using:
  ```bash
  export JULES_API_KEY=<your-api-key>
  ```

## Running the Example

You can run this example using `bun`, `tsx`, or `ts-node`:

### Using Bun

```bash
bun run index.ts
```

### Using Node.js and TSX

If you don't have `bun` installed, you can run the example using `tsx`:

```bash
npm install -g tsx
tsx index.ts
```

## Example Output

```text
Starting Agent Workflow Example...
Creating 3 sessions...
Finished creating 3 sessions.

Session jules:session:12345:
  State: succeeded
  Generated 1 files.
  - improvements.md

Session jules:session:67890:
  State: succeeded
  Generated 1 files.
  - deploy.sh

Session jules:session:54321:
  State: succeeded
  Generated 1 files.
  - test_cases.md

Workflow complete.
```