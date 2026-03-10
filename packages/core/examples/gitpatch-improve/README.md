# GitPatch Improve CLI Example

This example demonstrates how to use the Jules SDK to build a CLI that analyzes code using GitPatch data to identify areas for improvement or automation in a repository.

It follows the Typed Service Contract pattern (Spec & Handler) for robust error handling and input validation.

## Setup

1. Make sure you have installed the SDK dependencies in the project root.
2. Ensure you have your `JULES_API_KEY` set.

```sh
export JULES_API_KEY="your-api-key-here"
```

## Running

You can run the CLI script via `bun run start` or passing arguments directly:

```sh
# Run with defaults (davideast/dataprompt)
bun run start

# Run targeting a specific repo and querying the last 20 activities
bun run start --repo your-org/your-repo --limit 20
```

This will find a recent local GitPatch activity, create a session targeting the specified repository, and prompt the agent to analyze the code using the GitPatch data to identify areas for improvement and print out the analysis.
