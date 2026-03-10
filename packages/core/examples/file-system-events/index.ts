import { jules } from '@google/jules-sdk';
import chokidar from 'chokidar';
import fs from 'fs/promises';
import path from 'path';

// The directory to watch for file system events
const WATCH_DIR = path.join(process.cwd(), 'watched-directory');

// Utility to create the watched directory if it doesn't exist
async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function handleFileEvent(event: string, filepath: string) {
  console.log(`\nDetected '${event}' event on file: ${filepath}`);

  try {
    // Read the contents of the changed file
    const content = await fs.readFile(filepath, 'utf-8');

    console.log(`Initiating Jules session based on file content...`);

    // Initiate a Jules session with the file content
    const session = await jules.session({
      prompt: `A file was ${event} in the watched directory.

      File path: ${filepath}
      File content:
      \`\`\`
      ${content}
      \`\`\`

      Please review the content and suggest any improvements or note what this file is about.`,
      // Provide a default repository or adapt to your needs
      source: { github: 'davideast/dataprompt', baseBranch: 'main' },
    });

    console.log(`Created Jules session: ${session.id}`);

    // Wait for the final outcome of the session
    const outcome = await session.result();
    console.log(`Session finished with state: ${outcome.state}`);

  } catch (error) {
    console.error(`Error handling file event for ${filepath}:`, error);
  }
}

async function main() {
  await ensureDir(WATCH_DIR);

  console.log(`Watching for file changes in: ${WATCH_DIR}`);

  // Initialize watcher
  // We ignore initial add events to avoid triggering sessions for existing files on startup
  const watcher = chokidar.watch(WATCH_DIR, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
  });

  // Attach event listeners
  watcher
    .on('add', (path) => handleFileEvent('added', path))
    .on('change', (path) => handleFileEvent('changed', path))
    .on('error', (error) => console.error(`Watcher error: ${error}`));

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down file watcher...');
    watcher.close();
    process.exit(0);
  });
}

main().catch(console.error);
