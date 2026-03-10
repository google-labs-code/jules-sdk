---
name: jules-merge
---

# jules-merge Agent Skill

## Workflow Order

Always execute commands in this sequence:

1. `scan` — detect conflicts and build the manifest
2. `get-contents` — fetch file versions (base, main, pr:<N>) for each hot zone
3. `stage-resolution` — write resolved content for each conflicted file
4. `status` — confirm all files resolved (`ready: true`, `pending` is empty)
5. `push` — create the multi-parent reconciliation commit and PR
6. `merge` — merge the reconciliation PR using a merge commit

## Command Reference

### `scan`
- Required: `prs` (array of PR numbers), `repo` (owner/repo)
- Optional: `base` (branch name, default: main), `includeClean`

### `get-contents`
- `source` values: `"base"` | `"main"` | `"pr:<N>"` (e.g. `"pr:42"`)
- Always check `totalLines` in the response — if it exceeds your context budget, surface to the user rather than attempting to process the file
- `"base"` = the common ancestor commit (merge base), not main

### `stage-resolution`
- `parents` format: `"main,<prNumber>,<prNumber>"` — always start with `"main"`, followed by the PR numbers (as strings) that touch the file
- Example: `["main", "10", "11"]`
- Either `content` (inline string) or `fromFile` (local path) must be provided
- Use `--dry-run` to validate without writing to the manifest

### `push`
- `mergeStrategy` values: `"sequential"` (default) | `"octopus"`
  - `sequential`: creates N 2-parent merge commits in a chain — required for GitHub auto-close
  - `octopus`: creates a single N-parent commit — use for non-GitHub platforms or atomic history
- Check `warnings` in the output — if `"BASE_SHA_MISMATCH"` is present, re-run `scan` before merging
- `--dry-run` is safe to call at any time; it validates without writing
- `push` is idempotent: calling it twice on the same branch reuses the existing PR
- When using `sequential`, the output includes `mergeChain` — an array of `{ commitSha, parents, prId }` per step

### `merge`
- Always uses merge commit strategy — never squash or rebase
- This preserves the ancestry chain that auto-closes fleet PRs via GitHub's "closes" detection

## Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| `0` | Success | Continue |
| `1` | Recoverable conflict | Surface to user or re-scan |
| `2` | Hard error | Abort and surface to user |

## Key Invariants

- **Merge strategy**: always `merge` (not squash/rebase) — squash breaks the ancestry chain that closes fleet PRs
- **Push merge strategy**: default `sequential` creates 2-parent chain for GitHub compatibility; use `octopus` only for non-GitHub platforms
- **parents format**: `["main", "<prN>", "<prN>"]` — the string `"main"` is always first, followed by PR numbers as strings
- **Scan before push**: if `push` returns `warnings: ["BASE_SHA_MISMATCH"]`, re-run `scan` to refresh the base SHA before proceeding
- **Context window**: check `totalLines` on every `get-contents` response; if a file is too large for your context budget, surface to the user rather than processing it
- **Idempotency**: `scan` overwrites the manifest; `push` reuses an existing open PR on the same branch
- **No pending files**: `push` will throw if `status.pending` is non-empty — resolve all hot zones first

## Schema Introspection

```
jules-merge schema <command>     # input/output schema for one command
jules-merge schema --all         # all schemas at once
```
