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

## Finding GitPatch Data in the Local Cache

The handler queries the local activity cache with `jules.select()` and extracts `ChangeSetArtifact` data:

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

This searches recent activities for one that produced a changeset with a unidiff patch.

## Structured Code Review Output

The diff is sent to a new Jules session with a prompt that asks for a structured `review.md` with sections: Bugs, Optimizations, Style, and Verdict. The generated file is extracted from the session outcome:

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
