# Cron: Stitch → Jules Scheduler

Polls a Stitch project for new design screens every 5 minutes and creates a Jules session for each, converting the design into a React component. Tracks processed screens to avoid duplicates.

## Quick Start

```bash
npm install
export JULES_API_KEY="your-api-key"
export STITCH_API_KEY="your-stitch-key"
export STITCH_PROJECT_ID="your-project-id"
bun run index.ts
```

Starts the scheduler. Ctrl+C to stop.

## Polling and Deduplication

Every 5 minutes, `processNewScreens()` fetches all screens from the Stitch project and filters out already-processed ones:

```typescript
const screens = await project.screens();
const newScreens = screens.filter(s => !processedScreenIds.has(s.id));
```

After each screen is processed, its ID is added to the `Set<string>`, preventing duplicate sessions across runs.

## Design-to-React Conversion

For each new screen, the handler calls `screen.getHtml()`, builds a prompt with the HTML and a React Best Practices agent skill URL, and creates a session:

```typescript
const session = await jules.session({
  prompt: `Convert the following Stitch design to a React component...`,
  ...(GITHUB_REPO && { source: { github: GITHUB_REPO, baseBranch: 'main' } }),
  autoPr: true,
});
```

When `GITHUB_REPO` is set, sessions target that repo with auto-PR; otherwise they run repoless.

## Customizing the Schedule

Modify the cron expression in `index.ts`:

```typescript
cron.schedule('0 0 * * *', ...); // nightly
cron.schedule('*/30 * * * *', ...); // every 30 minutes
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JULES_API_KEY` | Yes | — | Jules API key |
| `STITCH_API_KEY` | Yes | — | Stitch API key |
| `STITCH_PROJECT_ID` | Yes | — | Stitch project to poll |
| `GITHUB_REPO` | No | — | Target repo (omit for repoless) |
