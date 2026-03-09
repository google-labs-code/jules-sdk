# GitHub Actions Example

This example demonstrates how to use the Jules SDK within a GitHub Action to automate workflows.

## Overview

This example creates a custom GitHub Action that:
1. Takes a `prompt` input.
2. Reads the `JULES_API_KEY` from the environment.
3. Automatically uses the current repository and branch as context.
4. Starts a Jules session to perform the task.
5. Monitors the progress and outputs the resulting Pull Request URL.

## Files

- `index.ts`: The main action logic using the Jules SDK.
- `action.yml`: The metadata file that defines the action inputs, outputs, and runtime.
- `package.json`: Dependencies for the action (`@actions/core`, `@actions/github`, `@google/jules-sdk`).

## Usage

You can use this action in your own GitHub workflows by referencing its path or publishing it.

Here is an example workflow file (`.github/workflows/jules.yml`) that triggers the agent whenever an issue is labeled `agent-fix`:

```yaml
name: Jules Agent Workflow

on:
  issues:
    types: [labeled]

jobs:
  run-jules:
    if: github.event.label.name == 'agent-fix'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run Jules Agent
        uses: ./packages/core/examples/github-actions # Path to where this action is located
        env:
          JULES_API_KEY: ${{ secrets.JULES_API_KEY }}
        with:
          prompt: "Fix the following issue: ${{ github.event.issue.title }}\n\n${{ github.event.issue.body }}"
```

## Running the Example Locally

To compile the TypeScript action:

```bash
cd packages/core/examples/github-actions
npm install
npm run build
```

The compiled JavaScript will be placed in `dist/index.js`, which is what GitHub Actions will execute.
