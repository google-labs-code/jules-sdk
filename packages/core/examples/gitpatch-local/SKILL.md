---
name: jules-gitpatch-local
version: 1.0.0
description: A CLI tool to securely download and apply a git patch from a Jules session.
---

# Jules GitPatch Local CLI

This CLI is frequently invoked by AI/LLM agents. It is designed with safety rails, strict validation, and structured output to prevent errors caused by hallucinated parameters.

Always assume your inputs can be adversarial or malformed.

## Agent Usage Guidelines

1. **Introspection First:** If you are unsure about the input or output schemas for this CLI, execute it with the `--describe` flag to dump the JSON schema.
   ```bash
   bun run index.ts "" --describe
   ```

2. **Dry Run Safety Rails:** This tool performs mutating operations on the local file system and git repository (`git checkout`, `git apply`, `git commit`). When instructed to "test" or "verify" changes, always append the `--dry-run` flag to ensure the changes are safely fetched and simulated without modifying the host.
   ```bash
   bun run index.ts <session-id> --dry-run
   ```

3. **Structured Outputs:** By default, this CLI prints human-friendly logs. As an agent, you must ALWAYS use the `--json` flag when invoking the command to receive a deterministic, machine-readable `Result` object.
   ```bash
   bun run index.ts <session-id> --json
   ```

4. **Input Hardening:**
   - The `<session-id>` parameter must not contain query parameters (`?`) or hash fragments (`#`).
   - The `--branch` parameter must not contain directory traversal characters (`..`) or control characters.

## Result Schema
The `--json` output will always follow the `ApplyPatchResult` discriminated union pattern:
```typescript
{
  success: true,
  data: { branchName: string, commitMessage?: string }
}
```
or
```typescript
{
  success: false,
  error: { code: string, message: string, recoverable: boolean }
}
```
