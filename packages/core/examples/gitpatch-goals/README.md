# GitPatch Goals

CLI that chains two Jules sessions: one to generate code, another to review it against the original goals. Extracts the GitPatch (unidiff) from the first session's snapshot and sends it to a second session for code review.

## Quick Start

```bash
export JULES_API_KEY="your-api-key"

# Generate and review code against a prompt
bun run start --prompt "Add input validation to the login form"

# Dry run (returns mock data without creating sessions)
bun run start --prompt "Add error handling" --dry-run
```

## Two-Session Pipeline: Generate → Review

The handler chains two sessions:

1. **Generate** — Creates a session with the prompt. After streaming, extracts the unidiff patch from `snapshot.changeSet().gitPatch.unidiffPatch`.

2. **Review** — Sends the patch to a second session that evaluates whether the generated code meets the original goals.

```typescript
const genSession = await generateCode(input.prompt);
// ...stream and collect...
const snapshot = await genSession.snapshot();
const gitPatch = snapshot.changeSet()?.gitPatch?.unidiffPatch;

const { reviewMessage } = await reviewCode(input.prompt, gitPatch);
```

## Extracting GitPatch from Session Snapshots

After streaming, `session.snapshot()` returns the full session state including `changeSet()` — a structured representation of the code changes. The `gitPatch.unidiffPatch` field contains the raw diff.

## Typed Service Contract Pattern

| File | Purpose |
|------|---------|
| `spec.ts` | `ReviewInput` and `ReviewResult` Zod schemas |
| `handler.ts` | Orchestrates the generate → review pipeline |
| `generate.ts` | Creates the code generation session |
| `review.ts` | Creates the code review session |
| `index.ts` | CLI wrapper with `citty` |
