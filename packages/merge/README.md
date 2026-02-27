# Jules Merge

Detect and surface merge conflicts between a coding agent's changes and the base branch — before or during CI.

## Check for conflicts in CI

```bash
npx @google/jules-merge check-conflicts \
  --repo your-org/your-repo \
  --pr 42 \
  --sha abc123
```

When a merge has already been attempted, `check-conflicts` reads conflict markers from the filesystem and returns structured JSON with the affected files, their conflict markers, and a task directive that tells the agent exactly what to resolve.

## Check for conflicts proactively

```bash
npx @google/jules-merge check-conflicts \
  --session 7439826373470093109 \
  --repo your-org/your-repo
```

This queries the Jules SDK for the session's changed files and compares them against recent commits on the base branch. If files overlap, it returns the remote file content (`remoteShadowContent`) so the agent can resolve conflicts without needing `git pull`.

## Generate a CI workflow

```bash
npx @google/jules-merge init
```

Writes `.github/workflows/jules-merge-check.yml` to your repo. The workflow runs on every pull request: it attempts a merge, and if conflicts exist, runs `check-conflicts` to produce structured output that Jules can act on.

```bash
npx @google/jules-merge init --base-branch develop --force
```

## Installation

```bash
npm i @google/jules-merge
```

For session-based checks, set authentication:

```
JULES_API_KEY         Required for session mode.
GITHUB_TOKEN          Required. GitHub PAT with repo access.
```

Or use GitHub App authentication:

```
GITHUB_APP_ID                   App ID
GITHUB_APP_PRIVATE_KEY_BASE64   Base64-encoded private key
GITHUB_APP_INSTALLATION_ID      Installation ID
```

## CLI Reference

### `jules-merge check-conflicts`

Detect merge conflicts. Mode is inferred from the arguments provided.

```
jules-merge check-conflicts [options]

Session mode (proactive):
  --session <id>     Jules session ID
  --repo <owner/repo>
  --base <branch>    Base branch (default: main)

Git mode (CI failure):
  --pr <number>      Pull request number
  --sha <sha>        Failing commit SHA
  --repo <owner/repo>
```

**Session mode** queries the Jules SDK for changed files and compares them against remote commits. Returns `remoteShadowContent` for each conflicting file.

**Git mode** reads `git status` for unmerged files and extracts conflict markers. Returns a `taskDirective` with resolution instructions.

### `jules-merge init`

Generate a GitHub Actions workflow for automated conflict detection.

```
jules-merge init [options]

Options:
  --output-dir <dir>         Directory to write into (default: .)
  --workflow-name <name>     Filename without .yml (default: jules-merge-check)
  --base-branch <branch>     Branch to check against (default: main)
  --force                    Overwrite existing file
```

## Programmatic API

All handlers are exported for use in scripts, CI pipelines, or other packages.

```ts
import {
  SessionCheckHandler,
  GitCheckHandler,
  InitHandler,
} from '@google/jules-merge';
```

### `SessionCheckHandler`

Compares a Jules session's changed files against remote commits on the base branch.

```ts
const handler = new SessionCheckHandler(octokit, julesClient);
const result = await handler.execute({
  sessionId: '7439826373470093109',
  repo: 'your-org/your-repo',
  base: 'main',
});

if (result.success && result.data.status === 'conflict') {
  for (const conflict of result.data.conflicts) {
    console.log(`${conflict.filePath}: ${conflict.conflictReason}`);
    console.log(conflict.remoteShadowContent);
  }
}
```

Returns `{ status: 'clean' | 'conflict', conflicts: [...] }` on success. Each conflict includes `filePath`, `conflictReason`, and `remoteShadowContent`.

### `GitCheckHandler`

Reads conflict markers from the local filesystem after a failed merge.

```ts
const handler = new GitCheckHandler();
const result = await handler.execute({
  repo: 'your-org/your-repo',
  pullRequestNumber: 42,
  failingCommitSha: 'abc123',
});

if (result.success) {
  console.log(result.data.taskDirective);
  for (const file of result.data.affectedFiles) {
    console.log(`${file.filePath}: ${file.gitConflictMarkers}`);
  }
}
```

Returns `{ taskDirective, priority, affectedFiles: [...] }` on success. Each file includes `filePath`, `baseCommitSha`, and `gitConflictMarkers`.

### `InitHandler`

Generates a GitHub Actions workflow file.

```ts
const handler = new InitHandler();
const result = await handler.execute({
  outputDir: '.',
  workflowName: 'jules-merge-check',
  baseBranch: 'main',
  force: false,
});

if (result.success) {
  console.log(`Created: ${result.data.filePath}`);
}
```

Returns `{ filePath, content }` on success.

### `buildWorkflowYaml`

Generate the workflow YAML string without writing to disk.

```ts
import { buildWorkflowYaml } from '@google/jules-merge';

const yaml = buildWorkflowYaml({
  workflowName: 'merge-check',
  baseBranch: 'main',
});
```

## MCP Server

The package exposes an MCP server with two tools:

- **`check_conflicts`** — Detects merge conflicts (session or git mode)
- **`init_workflow`** — Generates a CI workflow file

```bash
jules-merge mcp
```

## License

Apache-2.0

> **Note:** This is not an officially supported Google product. This project is not eligible for the [Google Open Source Software Vulnerability Rewards Program](https://bughunters.google.com/open-source-security).
