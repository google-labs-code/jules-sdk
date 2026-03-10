# Stitch Integration Example

This example demonstrates how to use the Jules SDK with Stitch to integrate Stitch's AI-generated designs into a website. It will use the `jules.session` method to connect to the Jules API, create a session, and use a prompt to process a Stitch design into a functional web component.

## Requirements

- Node.js >= 18 or Bun
- A Jules API Key (`JULES_API_KEY` environment variable)

## Setup

1. Make sure you have installed the SDK dependencies in the project root by running `bun install`.

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

The script creates a session using `jules.session` and asks the agent to generate a functional React component from a description of a Stitch design. It then waits for the result, retrieves the generated file, and displays it. This showcases how Jules can integrate AI designs into web development workflows.
