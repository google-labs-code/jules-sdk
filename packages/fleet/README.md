# Jules Fleet

> Status: Very Experimental. A just for fun prototype.

Continuous analysis and development, driven by simple goal files.

Fleet connects your development goals to Jules. 

1. Write goals as markdown files describing what you want — improved test coverage, API drift detection, triaging open issues. 

2. Fleet continuously analyzes your repository against those goals, creates actionable issues, dispatches Jules sessions to implement them, and sequentially merges the resulting PRs

The entire pipeline runs on a schedule via GitHub Actions, or on-demand from the CLI.

## Define a goal

Create a markdown file in `.fleet/goals/` describing what you want analyzed. Each goal produces a Jules analyzer session that reviews the repository and creates issues.

```markdown
---
milestone: "1"
---

# Improve test coverage

Find modules with low test coverage and add missing unit tests.

## Tools
- Test Coverage: `npx vitest --coverage --json`

## Assessment Hints
- Focus on uncovered error handling paths
- Look for edge cases in utility functions

## Insight Hints
- Report on overall test coverage metrics
- Note modules below 60% coverage

## Constraints
- Do NOT duplicate tests that already exist
- Use the existing test patterns in the repo
- Keep tasks small — one module per issue
```

## How the pipeline works

1. **Analyze** — Fleet dispatches Jules analyzer sessions with your goal files. Each session reviews the repository and creates GitHub issues labeled `fleet`.
2. **Dispatch** — Fleet finds undispatched `fleet` issues in a milestone and fires a Jules worker session for each. Each session works autonomously and creates a PR.
3. **Merge** — Fleet merges the resulting PRs one at a time, updating each branch and waiting for CI before the next merge.

If a merge conflict is detected, the fleet closes the conflicting PR, re-dispatches the task against the current base branch, and retries.

## Set up a repository

```bash
npx @google/jules-fleet init --repo your-org/your-repo
```

This creates a pull request containing three GitHub Actions workflows and an example goal file. It also creates the `fleet` and `fleet-merge-ready` labels. Merge the PR, then add `JULES_API_KEY` to your repository secrets.

## CLI Reference

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

Labels created: `fleet`, `fleet-merge-ready`

### `jules-fleet analyze`

Read goal files, fetch milestone context, and fire Jules analyzer sessions.

```
jules-fleet analyze [options]

Options:
  --goal <path>              Path to a specific goal file
  --goals-dir <dir>          Directory to discover goals from (default: .fleet/goals)
  --milestone <id>           Milestone ID to scope context
  --owner <owner>            Repository owner (auto-detected from git remote)
  --repo <repo>              Repository name (auto-detected from git remote)
```

Each goal file produces a Jules session that analyzes the repository and creates signals (GitHub issues labeled `fleet`).

### `jules-fleet dispatch`

Find undispatched fleet issues in a milestone and fire Jules worker sessions for each.

```
jules-fleet dispatch --milestone <id> [options]

Options:
  --milestone <id> (required)   Milestone ID to scope dispatch
  --owner <owner>               Repository owner (auto-detected from git remote)
  --repo <repo>                 Repository name (auto-detected from git remote)
```

Issues are skipped if they already have a dispatch event or linked PRs.

### `jules-fleet merge`

Sequentially merge PRs that are ready, updating branches and waiting for CI between each merge.

```
jules-fleet merge --owner <owner> --repo <repo> [options]

Options:
  --mode <label|fleet-run>   PR selection mode (default: label)
  --run-id <id>              Fleet run ID (required for fleet-run mode)
  --base <branch>            Base branch (default: main)
  --admin                    Bypass branch protection
  --re-dispatch              Re-dispatch on merge conflict (requires JULES_API_KEY)
```

**Label mode** merges all open PRs with the `fleet-merge-ready` label, oldest first.

**Fleet-run mode** merges PRs that contain a `<!-- fleet-run: <id> -->` marker in the body, grouping PRs from a single batch.

### `jules-fleet signal create`

Create a signal (insight or assessment) as a GitHub issue.

```
jules-fleet signal create --title <title> [options]

Options:
  --title <title> (required)   Signal title
  --kind <insight|assessment>  Signal kind (default: assessment)
  --body <markdown>            Signal body content
  --body-file <path>           Path to a markdown file for the body
  --tag <tags>                 Comma-separated tags
  --scope <name>               Scope name (maps to milestone in GitHub)
  --owner <owner>              Repository owner (auto-detected from git remote)
  --repo <repo>                Repository name (auto-detected from git remote)
```

Insights are informational findings. Assessments are actionable tasks that dispatch picks up.

### `jules-fleet configure`

Manage repository resources used by fleet workflows. Typically not needed — `init` creates labels automatically.

```
jules-fleet configure <resource> --owner <owner> --repo <repo> [options]

Resources:
  labels             Create or delete fleet labels

Options:
  --delete           Delete resources instead of creating them
```

### Environment Variables

```
GITHUB_TOKEN                    Required. GitHub token with repo access.
JULES_API_KEY                   Required for analyze, dispatch, and re-dispatch.
GITHUB_APP_ID                   GitHub App authentication (alternative to token).
GITHUB_APP_PRIVATE_KEY          GitHub App private key (PEM or base64).
GITHUB_APP_INSTALLATION_ID      GitHub App installation ID.
FLEET_BASE_BRANCH               Override default base branch (default: main).
```

## Programmatic API

The handlers are exported for use in scripts and custom workflows.

```ts
import {
  AnalyzeHandler,
  DispatchHandler,
  MergeHandler,
  createFleetOctokit,
} from '@google/jules-fleet';
import type { SessionDispatcher } from '@google/jules-fleet';

const octokit = createFleetOctokit();
const dispatcher: SessionDispatcher = {
  async dispatch(options) {
    // Wire up to @google/jules-sdk or your own agent
    const { jules } = await import('@google/jules-sdk');
    return jules.session(options);
  },
};

// Analyze — reads goals and creates analyzer sessions
const analyzer = new AnalyzeHandler({ octokit, dispatcher });
const analyzeResult = await analyzer.execute({
  owner: 'your-org',
  repo: 'your-repo',
  goalsDir: '.fleet/goals',
});

// Dispatch — finds fleet issues and creates worker sessions
const dispatch = new DispatchHandler({ octokit, dispatcher });
const dispatchResult = await dispatch.execute({
  owner: 'your-org',
  repo: 'your-repo',
  milestone: '1',
});

// Merge — sequentially merges fleet PRs
const merger = new MergeHandler({ octokit });
const mergeResult = await merger.execute({
  owner: 'your-org',
  repo: 'your-repo',
  mode: 'label',
  baseBranch: 'main',
});

if (mergeResult.success) {
  console.log(`Merged: ${mergeResult.data.merged.join(', ')}`);
}
```

## License

Apache-2.0

> **Note:** This is not an officially supported Google product. This project is not eligible for the [Google Open Source Software Vulnerability Rewards Program](https://bughunters.google.com/open-source-security).
