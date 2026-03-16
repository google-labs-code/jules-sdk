# GitHub Actions: `/jules` Slash Command

A GitHub Action that responds to `/jules <message>` comments onissues and PRs. On Jules-created PRs, it detects the existing session from the branch name and replies to it (optionally including failed CI context). On other issues/PRs, it creates a new session.

## Quick Start

Add to `.github/workflows/jules.yml`:

```yaml
name: Jules Agent
on:
  issue_comment:
    types: [created]

jobs:
  jules:
    if: contains(github.event.comment.body, '/jules')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./packages/core/examples/github-actions
        env:
          JULES_API_KEY: ${{ secrets.JULES_API_KEY }}
```

### Upload API Keys to GitHub Actions Secret Storage

1. Go to your GitHub repository settings
2. Click on "Secrets and variables" → "Actions"
3. Click "New repository secret"
4. Enter `JULES_API_KEY` as the name and your Jules API key as the value

`GITHUB_TOKEN` is provided automatically by GitHub Actions. To enable CI check fetching, add permissions to the workflow:

```yaml
permissions:
  checks: read
```


## Markdown-Safe Command Parsing

The `/jules` command is extracted using `marked.lexer()`, which parses the comment as proper markdown. Only paragraph tokens are inspected — `/jules` inside code blocks, blockquotes, headings, or inline code is ignored:

```typescript
export function parseCommand(body: string): string | null {
  const tokens = marked.lexer(body);
  for (const token of tokens) {
    if (token.type !== 'paragraph') continue;
    const text = token.text.trim();
    if (text.startsWith('/jules ')) return text.slice('/jules '.length).trim();
  }
  return null;
}
```

This is covered by tests in `parse-command.test.ts`, including edge cases like fenced code, blockquotes, and mixed formatting.

## Reply-to-Session on Jules PRs

When the comment is on a PR created by Jules, the action detects the session ID from the branch name (e.g., `fix-bug-1234567` → session `1234567`). It then replies to the existing session via `session.send()` instead of creating a new one.

If `GITHUB_TOKEN` is available, it also fetches failed CI checks for the PR's head commit and appends them to the message.

## Creating New Sessions

On non-Jules issues/PRs, the action creates a new session with `autoPr: true` targeting the repo and base branch. Progress is streamed via `logStream()` and the PR URL is set as an action output.

## Configuration

| Input/Env | Required | Description |
|-----------|----------|-------------|
| `JULES_API_KEY` | Yes | Jules API key (set as repository secret) |
| `GITHUB_TOKEN` | No | Enables fetching failed CI check context |
