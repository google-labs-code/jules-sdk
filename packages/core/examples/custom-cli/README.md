# Custom CLI

CLI that treats Jules as on-demand compute — sends an instruction (with optional local file input), streams progress, and writes the agent's output to a local file. Built with `citty` using the Typed Service Contract pattern and auto-discovered subcommands.

## Quick Start

```bash
export JULES_API_KEY="your-api-key"

# Run an instruction and save the output
bun run start run \
  --instruction="Scrape headlines from Hacker News" \
  --output-file="./hn.json"

# Feed a local file as input
bun run start run \
  --input="./data.csv" \
  --instruction="Clean and normalize the missing values" \
  --output-file="./cleaned.json"

# Dry run (fetch results but don't write to disk)
bun run start run --instruction="..." --output-file="./out.txt" --dry-run
```

## Jules as Serverless Compute

The handler sends a prompt that instructs the agent to treat its environment as a full Linux container — it can install dependencies, run scripts, and write output to a designated file:

```typescript
const session = await jules.session({
  prompt: `You are an autonomous Cloud Compute Agent with a full Linux environment.
## Objective
${instruction}
## Rules
1. Write and run scripts yourself. Install dependencies as needed.
2. Write the final result to \`final_output.txt\`.`,
});
```

The last `agentMessaged` activity is captured during streaming and written to the local output file.

## Agent-Friendly JSON Mode

Pass `--json` to receive a raw JSON payload and structured JSON output — useful when another agent is driving this CLI:

```bash
bun run start run \
  --json='{"instruction":"...", "outputFile":"./out.txt"}' \
  --output=json
```

## Auto-Discovered Subcommands

The entry point scans the `commands/` directory at runtime and dynamically imports any subdirectory with an `index.ts`, making the CLI extensible without modifying the entry point.

## Key Files

| File | Purpose |
|------|---------|
| `index.ts` | CLI entry with auto-discovery |
| `commands/run/spec.ts` | Zod schemas: `RunTaskRequest`, `RunTaskResponse` |
| `commands/run/handler.ts` | Reads input, creates session, streams, writes output |
| `commands/run/index.ts` | `citty` command: flag parsing and output formatting |
