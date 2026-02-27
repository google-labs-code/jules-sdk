# Use Case: Resolving Our Own PR Conflicts

How `jules-merge` detected and helped resolve merge conflicts in the PR that introduced `jules-merge` itself.

## Context

The `@google/jules-merge` package was developed on a git worktree (`feat/jules-merge`) branched from `main`. While development was underway, a separate effort on `main` refactored the `@google/jules-fleet` package — restructuring event namespacing, adding an init wizard with interactive/headless modes, and introducing UI renderer abstractions.

When the `feat/jules-merge` PR was opened, GitHub flagged 9 conflicting files:

| File | Conflict type |
|------|--------------|
| `package-lock.json` | content |
| `packages/fleet/package.json` | content |
| `packages/fleet/src/cli/init.command.ts` | content |
| `packages/fleet/src/init/handler.ts` | content |
| `packages/fleet/src/init/ops/commit-files.ts` | content |
| `packages/fleet/src/shared/events/init.ts` | add/add |
| `packages/fleet/src/shared/ui/interactive.ts` | add/add |
| `packages/fleet/src/shared/ui/plain.ts` | add/add |
| `packages/fleet/src/shared/ui/spec.ts` | add/add |

Every conflict was in `packages/fleet/` or root lockfiles. The `packages/merge/` directory had no conflicts — it was entirely new.

## Step 1: Attempt the merge locally

```bash
git fetch origin main
git merge origin/main --no-commit --no-ff
```

Output:
```
CONFLICT (content): Merge conflict in package-lock.json
CONFLICT (content): Merge conflict in packages/fleet/package.json
CONFLICT (content): Merge conflict in packages/fleet/src/cli/init.command.ts
CONFLICT (content): Merge conflict in packages/fleet/src/init/handler.ts
CONFLICT (content): Merge conflict in packages/fleet/src/init/ops/commit-files.ts
CONFLICT (add/add): Merge conflict in packages/fleet/src/shared/events/init.ts
CONFLICT (add/add): Merge conflict in packages/fleet/src/shared/ui/interactive.ts
CONFLICT (add/add): Merge conflict in packages/fleet/src/shared/ui/plain.ts
CONFLICT (add/add): Merge conflict in packages/fleet/src/shared/ui/spec.ts
Automatic merge failed; fix conflicts and then commit the result.
```

## Step 2: Run `jules-merge check-conflicts`

```bash
jules-merge check-conflicts \
  --repo google-labs-code/jules-sdk \
  --pr 1 \
  --sha $(git rev-parse HEAD)
```

The tool scanned `git status` for unmerged files, read each file to extract conflict markers, and returned structured JSON:

```json
{
  "success": true,
  "data": {
    "taskDirective": "MERGE CONFLICT RESOLUTION REQUIRED for PR #1...",
    "priority": "critical",
    "affectedFiles": [
      {
        "filePath": "packages/fleet/src/cli/init.command.ts",
        "gitConflictMarkers": "<<<<<<< HEAD\nimport { getGitRepoInfo }...\n=======\nimport { createRenderer, createEmitter, isInteractive }...\n>>>>>>> origin/main"
      }
    ]
  }
}
```

The output identified 5 files with conflict markers (the `add/add` conflicts in `shared/events/` and `shared/ui/` had markers; the lockfiles had minimal markers). Each entry showed both sides of the conflict inline.

## Step 3: Determine resolution strategy

The structured output made the decision straightforward:

- **Our branch** (`feat/jules-merge`) only added `packages/merge/`. It made no intentional changes to `packages/fleet/`.
- **Main** had substantive fleet refactoring (init wizard, event namespacing, UI renderer, overwrite support).
- **Resolution**: accept main's version for every conflicting file.

Without `check-conflicts`, this analysis would require manually opening each file, reading through conflict markers, and tracing which side introduced which change. The structured JSON made it clear that all conflicts originated from `main`'s fleet refactoring, not from our branch.

## Step 4: Resolve and push

```bash
git checkout --theirs \
  package-lock.json \
  packages/fleet/package.json \
  packages/fleet/src/cli/init.command.ts \
  packages/fleet/src/init/handler.ts \
  packages/fleet/src/init/ops/commit-files.ts \
  packages/fleet/src/shared/events/init.ts \
  packages/fleet/src/shared/ui/interactive.ts \
  packages/fleet/src/shared/ui/plain.ts \
  packages/fleet/src/shared/ui/spec.ts

git add package-lock.json packages/fleet/
git commit -m "merge: resolve conflicts with main (accept fleet changes)"
git push
```

## What `check-conflicts` provided

| Without `check-conflicts` | With `check-conflicts` |
|---------------------------|----------------------|
| Open each file, visually scan for `<<<<<<<` markers | Structured JSON listing every conflict |
| Manually determine which side changed what | Conflict markers show both sides inline |
| No machine-readable output for automation | JSON output parseable by agents or scripts |
| Risk of missing a conflict in a large file | Exhaustive — every unmerged file reported |

## Applicability

This use case demonstrates the **git mode** of `check-conflicts` — used after a merge attempt has already placed conflict markers in the working tree. The same tool also supports **session mode** for proactive detection before a merge is even attempted, using the Jules SDK to compare a session's changed files against the base branch.
