# GitPatch Local

CLI that downloads a GitPatch from a completed Jules session and applies it to a local branch. Extracts the unidiff from the session's changeset artifact, creates a new branch, and commits the changes locally.

## Quick Start

```bash
export JULES_API_KEY="your-api-key"

# Apply a session's patch to a new local branch
bun run start SESSION_ID

# Specify the branch name
bun run start SESSION_ID --branch my-feature

# Preview without modifying anything
bun run start SESSION_ID --dry-run

# Machine-readable output
bun run start SESSION_ID --json
```

## Patch Extraction from Session Artifacts

The handler retrieves the session by ID, hydrates its activities, and extracts the `ChangeSetArtifact` containing the unidiff patch:

```typescript
const session = jules.session(sessionId);
const snapshot = await session.snapshot();
```

The patch is then applied locally via `git apply`.

## Agent-Friendly Interface

The CLI supports `--json` for structured output and `--describe` for introspecting input/output schemas:

```bash
# Show Zod-derived JSON schemas for agent interop
bun run start --describe
```

`--dry-run` validates the input and fetches the patch but skips writing to disk or mutating git state.

## Typed Service Contract Pattern

| File | Purpose |
|------|---------|
| `spec.ts` | Zod schemas: `ApplyPatchInput`, `ApplyPatchResult` |
| `handler.ts` | `ApplyPatchHandler` — session retrieval, patch extraction, git operations |
| `index.ts` | CLI wrapper with `citty` — `--branch`, `--json`, `--dry-run`, `--describe` |
