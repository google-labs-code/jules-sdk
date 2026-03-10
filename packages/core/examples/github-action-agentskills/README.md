# GitHub Action Agent Skills Example

This example demonstrates how to use the Jules SDK on a scheduled GitHub Action cron job to analyze a repository and generate suggestions for Agent Skills that improve automation.

## Overview

The action reads the Agent Skills specification from [https://agentskills.io/specification.md](https://agentskills.io/specification.md) and instructs the Jules agent to:
1. Review the repository structure and workflows.
2. Identify areas where an Agent Skill could be beneficial.
3. Create corresponding Agent Skills configuration files.
4. Generate a pull request with the suggested changes.

## Files

- `index.ts`: The main action logic using the Jules SDK.
- `package.json`: Dependencies for the action (`@actions/core`, `@actions/github`, `@google/jules-sdk`).

## Usage

You can use this action in your own GitHub workflows by referencing its path or publishing it.

Here is an example workflow file (`.github/workflows/jules-agentskills.yml`) that triggers the agent on a weekly schedule:

```yaml
name: Jules Agent Skills Generator

on:
  schedule:
    # Run at 00:00 every Monday
    - cron: '0 0 * * 1'

jobs:
  run-jules-agentskills:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run Jules Agent Skills Analyzer
        uses: ./packages/core/examples/github-action-agentskills
        env:
          JULES_API_KEY: ${{ secrets.JULES_API_KEY }}
```

## Running the Example Locally

To compile the TypeScript action:

```bash
cd packages/core/examples/github-action-agentskills
npm install
npm run build
```

The compiled JavaScript will be placed in `dist/index.js`, which is what GitHub Actions will execute.
