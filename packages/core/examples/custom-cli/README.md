# Custom CLI Tools Example

This example demonstrates how to use the Jules SDK to create a custom command-line interface (CLI) tool. The tool uses `citty` for command structure and argument parsing, and `niftty` for rendering markdown and code outputs cleanly in the terminal.

Crucially, this CLI is optimized for **Agent DX**. It follows best practices for building CLIs that are robust against agent hallucinations by:
- Employing auto-discovery for scaling commands.
- Defining a "Typed Service Contract" using Zod (`spec.ts` + `handler.ts`) for input hardening and API predictability.
- Exposing a raw `--json` flag so agents can map directly to schemas.
- Exposing an `--output json` flag so agents can parse outputs deterministically.

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

The CLI supports both a **Human DX** (interactive, readable output) and an **Agent DX** (raw JSON payloads and responses).

### Human DX

You can run the CLI tool passing your prompt as an argument. The `citty` framework handles basic help flags automatically.

```bash
bun run index.ts session --prompt="Translate 'Hello, how are you?' into French."
```

Or view the help text:

```bash
bun run index.ts --help
bun run index.ts session --help
```

### Agent DX

Agents are prone to hallucination when creating strings but are very good at forming JSON matching strict schemas. For best results, expose `--json` flags.

```bash
bun run index.ts session --json='{"prompt": "List the files in the directory", "autoPr": false}' --output="json"
```

## Architecture

This project splits its logic to avoid monolithic file structures and merge conflicts:
- **`index.ts`**: The auto-discovery entry point that dynamically mounts available sub-commands.
- **`commands/*/spec.ts`**: The Zod schema defining the strict Typed Service Contract for a tool.
- **`commands/*/handler.ts`**: The pure business logic that consumes the contract and never crashes directly, preferring structured return errors.
- **`commands/*/index.ts`**: The `citty` command definition that parses flags and outputs data back to the environment.
