---
name: gitpatch-goals-cli
description: Evaluates generated code via GitPatch against original goals and coding standards.
version: 1.0.0
---

# GitPatch Goals CLI

This CLI uses Jules sessions to simulate code generation, extracts the resulting code as a GitPatch, and feeds it to a second Jules session to evaluate if it successfully met the original prompt's goals and adheres to coding standards.

## Usage Guidelines for AI Agents

When invoking this CLI, adhere to the following best practices:

1. **Schema Introspection**: You can introspect the required arguments and schema at runtime by passing `--describe`.
   ```bash
   bun run index.ts --describe
   ```

2. **Context Window Discipline**: Use `--json` for predictable, deterministic, machine-readable output. Avoid parsing raw terminal stdout.
   ```bash
   bun run index.ts --prompt "Create an API" --json
   ```

3. **Input Hardening**: Before executing mutations or relying on long-running APIs (like creating Jules Sessions), validate your payload using the `--dry-run` flag to ensure the CLI safely accepts your arguments without executing side effects.
   ```bash
   bun run index.ts --prompt "Create an API" --dry-run
   ```
