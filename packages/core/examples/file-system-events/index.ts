import { jules } from '@google/jules-sdk';
import chokidar from 'chokidar';
import fs from 'fs/promises';
import path from 'path';
import '../_shared/check-env.js';
import { resolveSource } from '../_shared/resolve-source.js';
import { logStream } from '../_shared/log-stream.js';

const rawDir = process.env.WATCH_DIR || 'watched-directory';
const WATCH_DIR = path.resolve(process.cwd(), rawDir);

// Guard against path traversal (e.g., WATCH_DIR="../../etc")
if (!WATCH_DIR.startsWith(process.cwd())) {
  console.error(`Error: WATCH_DIR must resolve inside the working directory. Got: ${WATCH_DIR}`);
  process.exit(1);
}

await fs.mkdir(WATCH_DIR, { recursive: true });

const source = resolveSource();

async function handleFileEvent(event: string, filepath: string) {
  console.log(`\n[${event}] ${filepath}`);

  const content = await fs.readFile(filepath, 'utf-8');

  const session = await jules.session({
    prompt: `A file was ${event}.\nPath: ${filepath}\nContent:\n\`\`\`\n${content}\n\`\`\`\nReview and suggest improvements.`,
    source,
  });

  console.log(`Session created: ${session.id}`);

  session.result().then(outcome => {
    console.log(`Session ${outcome.state}. PR: ${outcome.pullRequest?.url ?? 'none'}`);
  });

  await logStream(session, {
    agentMessaged: (a) => console.log(`Agent: ${a.message}`),
    progressUpdated: (a) => console.log(`Progress: ${a.title}`),
  });
}

console.log(`Watching: ${WATCH_DIR}`);
console.log(`Source: ${source.github} (${source.baseBranch})`);

const watcher = chokidar.watch(WATCH_DIR, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: true,
});

watcher
  .on('add', (p) => handleFileEvent('added', p))
  .on('change', (p) => handleFileEvent('changed', p));

process.on('SIGINT', () => {
  watcher.close();
  process.exit(0);
});
