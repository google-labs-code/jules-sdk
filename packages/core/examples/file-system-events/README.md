# File System Events

Watches a local directory with `chokidar` and triggers a Jules session whenever a file is added or changed. The session receives the file content inline and reviews it for improvements.

## Quick Start

```bash
npm install
export JULES_API_KEY="your-api-key"
export WATCH_DIR="watched-directory"  # optional, defaults to watched-directory
bun run index.ts
```

Creates the watch directory and starts watching. Trigger a session:

```bash
echo "console.log('hello')" > watched-directory/test.js
```

`WATCH_DIR` must resolve inside the working directory — paths containing `..` that escape `cwd` are rejected to prevent path traversal.

## Event-Driven Session Creation

On each file event, the handler reads the file content and embeds it in the prompt:

```typescript
const session = await jules.session({
  prompt: `A file was ${event}.\nPath: ${filepath}\nContent:\n...\nReview and suggest improvements.`,
  source,
});
```

Each session streams progress via `logStream()` and logs results non-blocking via `session.result().then()`.

## Automatic Repo Detection

The repo source is resolved via `resolveSource()`: checks `GITHUB_REPO` env var → parses `git remote get-url origin` (SSH or HTTPS) → falls back to a hardcoded default.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JULES_API_KEY` | Yes | — | API key |
| `GITHUB_REPO` | No | Auto-detected | Target repo (`owner/repo`) |
| `BASE_BRANCH` | No | `main` | Base branch |
