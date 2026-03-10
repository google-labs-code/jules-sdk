# GitPatch Improve Example

This example demonstrates how to use the Jules SDK to create a session that analyzes code using GitPatch data to identify areas for improvement or automation in a repository.

## Setup

1. Make sure you have installed the SDK dependencies in the project root.
2. Ensure you have your `JULES_API_KEY` set.

```sh
export JULES_API_KEY="your-api-key-here"
```

## Running

You can run the script via:

```sh
bun run index.ts
```

This will create a session targeting a specific repository and prompt the agent to analyze the code using GitPatch data to identify areas for improvement and print out the analysis.
