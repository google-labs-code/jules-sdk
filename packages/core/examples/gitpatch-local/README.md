# Gitpatch Local Example

This example demonstrates how to use the Jules SDK to create a session, retrieve a `changeSet` artifact, and apply the generated code modifications locally on your machine using Git.

It specifically showcases how to:
- Create a simple text file locally to act as a target.
- Spin up a local git branch.
- Request Jules to modify the file content.
- Download the resulting `GitPatch` (`unidiffPatch`) and write it to a `.patch` file.
- Use `git apply` to patch the code on the local machine and commit the changes.

## Requirements

- Node.js >= 18 or Bun
- A Jules API Key (`JULES_API_KEY` environment variable)
- `git` installed and available in your `PATH`
- Must be executed inside a git repository (so `git checkout -b` and `git apply` work)

## Setup

1. Make sure you have installed the SDK dependencies in the project root.

2. Export your Jules API key:

```bash
export JULES_API_KEY="your-api-key-here"
```

## Running the Example

Using `bun`:

```bash
bun run index.ts
```

Using `npm` and `tsx` (or similar TypeScript runner):

```bash
npx tsx index.ts
```

## What it does

The script creates a temporary file `test_patch_target.txt` and starts a local git branch. It creates a session using `jules.session` to ask an agent to change the second line of the file. Once complete, it searches the session activities for a `changeSet` artifact. It extracts the `unidiffPatch` from the artifact's `gitPatch` property, writes it to a `.patch` file locally, and uses standard `git apply` to patch the local file. It then cleans up by rolling back the git changes and deleting the temporary file.
