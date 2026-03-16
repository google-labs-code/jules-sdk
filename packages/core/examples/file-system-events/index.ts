import { jules } from '@google/jules-sdk';
import chokidar from 'chokidar';
import fs from 'fs/promises';
import path from 'path';
import '../_shared/check-env.js';
import { resolveSource } from '../_shared/resolve-source.js';
import { logStream } from '../_shared/log-stream.js';

const WATCH_DIR = path.join(process.cwd(), 'watched-directory');
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
