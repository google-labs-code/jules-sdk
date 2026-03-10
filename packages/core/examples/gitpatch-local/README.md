# Gitpatch Local Example (CLI)

This example demonstrates how to use the Jules SDK to retrieve a `changeSet` artifact's GitPatch from a specific session and apply the generated code modifications locally on your machine using Git.

It is structured as a **CLI application** using `citty` and follows the **Typed Service Contract** pattern. It separates validation (`spec.ts`) and impure side effects (`handler.ts`), and provides agent-friendly `json` output flags to demonstrate CLI agent best practices.

It specifically showcases how to:
- Pass a `sessionId` as a positional CLI argument.
- Use `session.snapshot()` to retrieve the generated changes directly without relying on local cache queries.
- Download the resulting `GitPatch` (`unidiffPatch`) and write it to a `.patch` file.
- Use safely executed `execFileSync` to spin up a local git branch, `git apply` to patch the code, and commit the changes.

## Requirements

- Node.js >= 18 or Bun
- A Jules API Key (`JULES_API_KEY` environment variable)
- `git` installed and available in your `PATH`
- Must be executed inside a git repository (so `git checkout -b` and `git apply` work)
- A valid Jules Session ID that contains a `changeSet` artifact.

## Setup

1. Make sure you have installed the SDK dependencies in the project root.

2. Export your Jules API key:

```bash
export JULES_API_KEY="your-api-key-here"
```

3. Ensure example dependencies are installed:
```bash
bun install
```

## Running the Example

Using `bun`:

```bash
bun run index.ts <SESSION_ID>
```

**Options:**
- `--branch <name>`: Provide a custom name for the local git branch to be created (default is `jules-patch-test-<timestamp>`).
- `--json`: Output the result of the operation as a strict JSON blob (ideal for AI Agent consumption).

Example:
```bash
bun run index.ts jules:session:123456789 --branch test-patch-fix --json
```

## What it does

The CLI validates the input session ID using Zod. It then queries the Jules API for that session's snapshot data. It searches the snapshot for a `changeSet` artifact. It extracts the `unidiffPatch` from the artifact's `gitPatch` property, writes it to a `.patch` file locally, and uses standard `git apply` to patch the local git repository in the specified branch. Finally, it commits the applied patch. All side effects are encapsulated within a handler that returns a structured Result object (Success/Failure) rather than throwing raw exceptions.
