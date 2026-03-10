# Google Docs Context Example CLI

This example demonstrates how to extract text content from a Google Document using the `googleapis` library and pass it as context into an interactive Jules session prompt using a Command Line Interface (CLI).

It implements the [Typed Service Contract](https://raw.githubusercontent.com/davideast/stitch-mcp/refs/heads/main/.gemini/skills/typed-service-contract/skill.md) pattern and follows [Agent CLI Best Practices](https://justin.poehnelt.com/posts/rewrite-your-cli-for-ai-agents.md) with a dedicated `--json` output format.

## Requirements

- Node.js >= 18 or Bun
- A Jules API Key (`JULES_API_KEY` environment variable)
- Google Cloud Service Account Credentials configured for application default (`GOOGLE_APPLICATION_CREDENTIALS` environment variable)
- Enable the Google Docs API in your Google Cloud Project.

## Setup

1. Make sure you have installed the SDK dependencies in the project root by running `bun install`.

2. Export your Jules API key:
   ```bash
   export JULES_API_KEY="your-api-key-here"
   ```

3. Export your Google Cloud Credentials JSON file path:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-file.json"
   ```

## Running the CLI

Navigate to this directory and use `bun` to run the file. Use the `--help` flag to see available options:

```bash
bun run index.ts --help
```

### Basic Usage

Provide the document ID and your prompt for the AI agent:

```bash
bun run index.ts \
  --documentId "195j9e5Wezsq1Z-Jz3R8Q1R_1Z-Jz3R8Q1R_1Z-Jz3R" \
  --prompt "Summarize the key points of this document."
```

### Agent / Machine-Readable Mode

To output the result as a strictly formatted JSON object suitable for agents and downstream parsing, use the `--json` flag:

```bash
bun run index.ts --documentId "..." --prompt "..." --json
```

## What it does

The script uses `citty` to parse arguments and `zod` to validate input schemas (Spec and Handler pattern). It authenticates with Google Cloud using Application Default Credentials to retrieve the text content from the provided document ID.

It extracts the text, appends it to your prompt, and starts a `jules.session()`. It waits for the agent to complete the task and displays the final analysis response or output files, returning structured errors on failure without throwing unhandled exceptions.
