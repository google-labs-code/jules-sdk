# GitPatch Review

End-to-end code review pipeline: creates a session to generate code, extracts the resulting diff, then sends that diff to a second session for review. The two-session pattern lets you separate generation from evaluation.

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

### 1. Code Generation

Creates a session with the prompt and GitHub source. Streams progress via `logStream()`.

### 2. GitPatch Extraction

After the session completes, `session.snapshot()` returns the full session state. The handler extracts the unidiff from `changeSet().gitPatch.unidiffPatch` — a standard unified diff:

```diff
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -5,6 +5,9 @@
 export function parseInput(raw: string) {
   const trimmed = raw.trim();
+  if (!trimmed) {
+    throw new Error('Input cannot be empty');
+  }
   return JSON.parse(trimmed);
 }
```

In code:

```typescript
const snapshot = await session.snapshot();
const changeSet = snapshot.changeSet();
const gitPatch = changeSet?.gitPatch?.unidiffPatch;
```

### 3. Fallback to Parsed File Metadata

When the raw unidiff isn't available, the handler falls back to `changeSet().parsed().files`, which provides structured file-level change metadata:

```typescript
const files = changeSet.parsed().files;
return files.map(f =>
  `--- a/${f.path}\n+++ b/${f.path}\n@@ ${f.changeType}: +${f.additions}/-${f.deletions} @@`
).join('\n');
```

### 4. Code Review

The diff (or fallback summary) is sent to a second session that reviews it for coding standards. The last `agentMessaged` activity is captured as the review output.

## E2E Testing

`e2e-test.ts` runs the full pipeline against a real repository, verifying that both sessions complete and produce output:

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
