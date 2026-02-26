# Jules Fleet

Coordinate multiple coding agent sessions across a GitHub repository and merge their pull requests sequentially.

## Define a goal

Create a markdown file in `.fleet/goals/` describing what you want done. Goals are dispatched as agent sessions that each produce a pull request.

```markdown
---
milestone: "1"
---

# Improve test coverage

Find modules with low test coverage and add missing unit tests.

## Focus Areas
- Uncovered error handling paths
- Edge cases in utility functions
- Integration between modules

## Rules
- Each test file should cover one module
- Do NOT duplicate tests that already exist
- Use the existing test patterns in the repo
```

## What happens when goals are dispatched

1. **Analyze** — The fleet reads your goal files and creates GitHub issues from them.
2. **Dispatch** — Each issue is sent to a Jules session that works on it in parallel.
3. **Merge** — Once sessions produce PRs, the fleet merges them one at a time, updating each branch and waiting for CI before the next merge.

If a merge conflict is detected, the fleet closes the conflicting PR, re-dispatches the task against the current base branch, and retries.

## Set up a repository

```bash
npx @google/jules-fleet init --repo your-org/your-repo
```

This creates a pull request containing three GitHub Actions workflows and an example goal file. Merge the PR, then add `JULES_API_KEY` to your repository secrets.

## Configure labels

```bash
npx @google/jules-fleet configure labels --owner your-org --repo your-repo
```

Creates the `fleet-merge-ready` and `fleet` labels used by the workflows. Safe to run multiple times — existing labels are skipped.

## CLI Reference

### `jules-fleet merge`

Sequentially merge PRs that are ready, updating branches and waiting for CI between each merge.

```
jules-fleet merge --owner <owner> --repo <repo> [options]

Options:
  --mode <label|fleet-run>   PR selection mode (default: label)
  --run-id <id>              Fleet run ID (required for fleet-run mode)
  --base <branch>            Base branch (default: main)
  --admin                    Bypass branch protection
```

**Label mode** merges all open PRs with the `fleet-merge-ready` label, oldest first.

**Fleet-run mode** merges PRs that contain a `<!-- fleet-run: <id> -->` marker in the body, grouping PRs from a single batch.

### `jules-fleet init`

Scaffold a repository for fleet workflows by creating a PR with the necessary files.

```
jules-fleet init --repo <owner/repo> [options]

Options:
  --base <branch>   Base branch for the PR (default: main)
```

Files added by the PR:
- `.github/workflows/fleet-merge.yml`
- `.github/workflows/fleet-dispatch.yml`
- `.github/workflows/fleet-analyze.yml`
- `.fleet/goals/example.md`

### `jules-fleet configure`

Manage repository resources used by fleet workflows.

```
jules-fleet configure <resource> --owner <owner> --repo <repo> [options]

Resources:
  labels             Create or delete fleet labels

Options:
  --delete           Delete resources instead of creating them
```

### Environment Variables

```
GITHUB_TOKEN    Required. GitHub token with repo access.
JULES_API_KEY   Required for dispatch and re-dispatch operations.
```

## Programmatic API

The handlers are exported for use in scripts and custom workflows.

```ts
import { MergeHandler, InitHandler, ConfigureHandler } from '@google/jules-fleet';
import { Octokit } from 'octokit';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const merge = new MergeHandler(octokit);
const result = await merge.execute({
  mode: 'label',
  baseBranch: 'main',
  admin: false,
  owner: 'your-org',
  repo: 'your-repo',
});

if (result.success) {
  console.log(`Merged: ${result.data.merged.join(', ')}`);
}
```

## License

Apache-2.0

> **Note:** This is not an officially supported Google product. This project is not eligible for the [Google Open Source Software Vulnerability Rewards Program](https://bughunters.google.com/open-source-security).
