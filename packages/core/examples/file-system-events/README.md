# File System Events Example

This example demonstrates how to use the Jules TypeScript SDK in an event-driven workflow. It uses `chokidar` to monitor local file system events (e.g., when a file is added or changed) and automatically triggers a Jules coding session.

## Prerequisites

- Bun installed
- A valid `JULES_API_KEY` exported in your environment.

## Running the Example

1. Install dependencies from the monorepo root:
   ```bash
   bun install
   ```
2. Start the watcher:
   ```bash
   bun run start
   ```
3. Trigger a file system event by modifying a file in the watched directory (e.g., creating `watched-directory/test.txt`):
   ```bash
   mkdir -p watched-directory
   touch watched-directory/test.txt
   ```

The watcher will detect the file change and automatically trigger a Jules session based on the contents of the changed file.
