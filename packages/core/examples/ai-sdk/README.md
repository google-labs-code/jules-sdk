# Vercel AI SDK Integration Example

This example demonstrates how to integrate the Jules SDK with the Vercel AI SDK to provide AI-powered coding capabilities within an AI application.

It uses the `generateText` function from the `ai` package and an OpenAI model. The AI is given a custom tool called `executeCodingTask` which internally uses the Jules SDK to spin up a cloud environment and perform a complex coding task.

## Prerequisites

- Node.js or Bun installed.
- A Jules API Key. Set it using:
  ```bash
  export JULES_API_KEY=<your-api-key>
  ```
- An OpenAI API Key. Set it using:
  ```bash
  export OPENAI_API_KEY=<your-openai-api-key>
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

## Example Overview

1. The script initializes an OpenAI model.
2. It calls `generateText` with a user prompt asking for a coding fix.
3. The AI model determines it needs to call the `executeCodingTask` tool.
4. The tool executes, creating a Jules session (`jules.session`) and waits for the result.
5. The outcome is returned to the AI model, which then summarizes the action to the user.
