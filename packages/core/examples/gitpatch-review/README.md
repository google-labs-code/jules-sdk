# GitPatch Review

Full code review pipeline: creates a session to generate code, extracts the diff, then creates a second session to review it. Supports both unidiff patch extraction and fallback to parsed file metadata. Includes an E2E test.

## Quick Start

```bash
export JULES_API_KEY="your-api-key"

# Generate code and review it
bun run start --prompt "Add error handling" --repo owner/repo

# JSON output for programmatic use
bun run start --prompt "Fix the bug" --repo owner/repo --json

# Dry run
bun run start --prompt "Refactor utils" --repo owner/repo --dry-run
```

## Two-Session Generate → Review Pipeline

1. **Code generation** — Creates a session with the prompt and GitHub source. Streams progress via `logStream()`.

2. **Patch extraction** — After streaming, calls `session.snapshot()` and extracts the diff. Tries `changeSet().gitPatch.unidiffPatch` first; if unavailable, falls back to `changeSet().parsed().files` for a file-level summary.

3. **Code review** — Sends the diff to a second session that reviews it for clean coding standards. Captures the last `agentMessaged` activity as the review output.

## Parsed File Fallback

When the raw unidiff isn't available, the handler builds a summary from parsed file metadata:

```typescript
const files = changeSet.parsed().files;
return files.map(f => `--- a/${f.path}\n+++ b/${f.path}\n@@ ${f.changeType}: +${f.additions}/-${f.deletions} @@`).join('\n');
```

## E2E Testing

`e2e-test.ts` runs the full pipeline against a real repository, verifying that both sessions complete and produce output. Run with:

```bash
bun test
```

## Configuration

| Flag | Default | Description |
|------|---------|-------------|
| `--prompt` | — | Required. The coding task |
| `--repo` | `davideast/dataprompt` | Target GitHub repo |
| `--base-branch` | `main` | Base branch |
| `--json` | `false` | Machine-readable output |
| `--dry-run` | `false` | Skip real sessions |
