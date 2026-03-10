# Jules Merge

Reconcile overlapping PR changes from parallel AI agents — scan, resolve, push, merge.

## Workflow

```
1. scan        — detect overlapping files and build the reconciliation manifest
2. get-contents — fetch file versions (base, main, pr:<N>) for each hot zone
3. stage-resolution — write resolved content for each conflicted file
4. status      — confirm all files resolved (ready: true, pending is empty)
5. push        — create the multi-parent reconciliation commit and PR
6. merge       — merge the reconciliation PR using a merge commit
```

## Quick Start

```bash
npx @google/jules-merge scan --json '{"prs":[10,11],"repo":"owner/repo"}'
```

## Installation

```bash
npm i @google/jules-merge
```

## Authentication

Uses the same auth pattern as Fleet. The CLI resolves auth internally — no external decode steps.

**GitHub App (recommended):**

```
FLEET_APP_ID                    App ID
FLEET_APP_PRIVATE_KEY_BASE64    Base64-encoded private key (canonical)
FLEET_APP_INSTALLATION_ID       Installation ID
```

Legacy names (`GITHUB_APP_*`) are accepted with a deprecation warning.

**Token (fallback):**

```
GITHUB_TOKEN    or    GH_TOKEN
```

## CLI Reference

All commands support `--json <payload>` for agent-first usage.

### `jules-merge scan`

Scan PRs for overlapping file changes and build the reconciliation manifest.

```bash
jules-merge scan --json '{"prs":[10,11],"repo":"owner/repo","base":"main"}'
jules-merge scan --prs 10,11 --repo owner/repo --base main
```

### `jules-merge get-contents`

Fetch file content from base, main, or a specific PR.

```bash
jules-merge get-contents --json '{"filePath":"src/config.ts","source":"pr:10","repo":"owner/repo"}'
```

### `jules-merge stage-resolution`

Stage a resolved file for the reconciliation commit.

```bash
jules-merge stage-resolution --json '{"filePath":"src/config.ts","parents":["main","10","11"],"content":"resolved content"}'
```

### `jules-merge status`

Show reconciliation manifest status.

```bash
jules-merge status
```

### `jules-merge push`

Create the multi-parent reconciliation commit and PR.

```bash
jules-merge push --json '{"branch":"reconcile/batch","message":"Reconcile PRs","repo":"owner/repo"}'
```

Supports `--mergeStrategy sequential` (default, enables GitHub auto-close) or `octopus`.

### `jules-merge merge`

Merge the reconciliation PR. Always uses merge commit — never squash or rebase.

```bash
jules-merge merge --json '{"pr":999,"repo":"owner/repo"}'
```

### `jules-merge schema`

Print JSON schema for command inputs/outputs.

```bash
jules-merge schema scan
jules-merge schema --all
```

## Programmatic API

```ts
import {
  scanHandler,
  getContentsHandler,
  stageResolutionHandler,
  statusHandler,
  pushHandler,
  mergeHandler,
  createMergeOctokit,
} from '@google/jules-merge';

const octokit = createMergeOctokit();
const scan = await scanHandler(octokit, { prs: [10, 11], repo: 'owner/repo' });
```

All handlers take an Octokit instance as the first argument (dependency injection).

## MCP Server

7 tools: `scan_fleet`, `get_file_contents`, `stage_resolution`, `get_status`, `push_reconciliation`, `merge_reconciliation`, `get_schema`.

```bash
jules-merge mcp
```

## License

Apache-2.0

> **Note:** This is not an officially supported Google product. This project is not eligible for the [Google Open Source Software Vulnerability Rewards Program](https://bughunters.google.com/open-source-security).
