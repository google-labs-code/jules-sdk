# GitPatch Improve

CLI that finds recent GitPatch data from your Jules activity history, sends the diff to a new Jules session for code quality analysis, and extracts the generated `review.md` file. Uses the Typed Service Contract pattern (Spec & Handler).

## Quick Start

```bash
export JULES_API_KEY="your-api-key"

# Analyze the most recent GitPatch
bun run start

# Target a specific repo and search more history
bun run start --repo your-org/your-repo --limit 20
```


## Reviewing Recent Code Changes

This example searches your recent Jules activity history for code changes, sends them to a new session for code review, and extracts the generated `review.md` with sections for Bugs, Optimizations, Style, and Verdict.

### What's a GitPatch?

When a Jules session modifies code, the changes are stored as a **GitPatch** — a standard unified diff attached to the session's activity artifacts. It's the same format `git diff` produces:

```diff
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -12,7 +12,10 @@
 export async function validateToken(token: string) {
-  const decoded = jwt.verify(token, SECRET);
-  return decoded;
+  try {
+    const decoded = jwt.verify(token, SECRET);
+    return { valid: true, payload: decoded };
+  } catch (err) {
+    return { valid: false, error: err.message };
+  }
 }
```

In the SDK, this diff lives at `ChangeSetArtifact.gitPatch.unidiffPatch`. The handler queries the local activity cache for a recent activity that has one:

```typescript
const activities = await jules.select({
  from: 'activities',
  order: 'desc',
  limit,
});

for (const activity of activities) {
  const patch = (artifact as ChangeSetArtifact).gitPatch?.unidiffPatch;
  if (patch) return { diff: patch, sessionId: activity.session?.id };
}
```

Once found, the diff is sent to a new session for review. The generated `review.md` is extracted from the session outcome:

```typescript
const reviewFile = outcome.generatedFiles().get('review.md');
return reviewFile?.content ?? null;
```

## Typed Service Contract Pattern

The example follows the Spec & Handler architecture:

| File | Purpose |
|------|---------|
| `spec.ts` | Zod schemas for `AnalyzeGitPatchInput` and `AnalyzeGitPatchResult` |
| `handler.ts` | `AnalyzeGitPatchHandler` — finds patches, creates analysis session |
| `index.ts` | CLI wrapper with `citty` — parses `--repo` and `--limit` flags |

## Configuration

| Flag | Default | Description |
|------|---------|-------------|
| `--repo` | `davideast/dataprompt` | Target GitHub repo |
| `--limit` | `10` | Number of recent activities to search |
