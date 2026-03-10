import { defineCommand, runMain } from 'citty';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadCommands() {
  const commandsDir = path.join(__dirname, 'commands');
  const commands: Record<string, any> = {};

  try {
    const entries = await fs.readdir(commandsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const commandPath = path.join(commandsDir, entry.name, 'index.ts');

        try {
          await fs.access(commandPath);
          const commandModule = await import(`./commands/${entry.name}/index.ts`);
          if (commandModule.default) {
            commands[entry.name] = commandModule.default;
          }
        } catch (e) {
          // Ignore if index.ts doesn't exist in the folder
        }
      }
    }
  } catch (e) {
    console.error('Failed to load commands:', e);
  }

  return commands;
}

async function start() {
  const subCommands = await loadCommands();

  const main = defineCommand({
    meta: {
      name: 'jules-cli',
      version: '1.0.0',
      description: 'A custom AI CLI tool optimized for Agent DX using the Jules SDK',
    },
    subCommands,
  });

  runMain(main);
}

start();
