# GitHub Actions: Agent Skills Generator

A GitHub Action that analyzes a repository and generates [Agent Skills](https://agentskills.io) configuration files. Triggered when an issue is labeled, it creates a Jules session targeting the repo, references the Agent Skills specification and React Best Practices as examples, and opens a PR with the generated skills.

## Quick Start

Add to `.github/workflows/agent-skills.yml`:

```yaml
name: Generate Agent Skills
on:
  issues:
    types: [labeled]

jobs:
  generate:
    if: github.event.label.name == 'generate-skills'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./packages/core/examples/github-action-agentskills
        env:
          JULES_API_KEY: ${{ secrets.JULES_API_KEY }}
```

## Repository Analysis and Skill Generation

The action reads the current repo/branch from the GitHub Actions context and creates a session that:

1. Reviews the repository structure, code, and workflows
2. Identifies 1–3 areas where an Agent Skill could help
3. Creates the corresponding `AGENTS.md` configuration files
4. Explains what each skill does and why it's useful

The prompt references the Agent Skills specification and a React Best Practices skill as examples.

## Actions Context Resolution

The action resolves the repo and branch from multiple sources for robustness:

```typescript
const owner = context.repo.owner || process.env.GITHUB_REPOSITORY?.split('/')[0];
const baseBranch = (context.ref || process.env.GITHUB_REF || 'refs/heads/main').replace('refs/heads/', '');
```

Session output (PR URL, file count) is set as action outputs via `core.setOutput()`, and failures call `core.setFailed()`.
