#!/usr/bin/env node
// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { defineCommand, runMain } from 'citty';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Dynamically discovers and registers all *.command.ts files in this directory.
 * Adding a new command only requires creating a new .command.ts file — no
 * changes to this entry point are needed.
 */
async function discoverCommands(): Promise<Record<string, any>> {
  const commands: Record<string, any> = {};
  const files = readdirSync(__dirname).filter((f) =>
    f.endsWith('.command.ts') || f.endsWith('.command.js') || f.endsWith('.command.mjs'),
  );

  for (const file of files) {
    const name = file.replace(/\.command\.(ts|js|mjs)$/, '');
    const mod = await import(pathToFileURL(join(__dirname, file)).href);
    commands[name] = mod.default;
  }

  return commands;
}

const subCommands = await discoverCommands();

const main = defineCommand({
  meta: {
    name: 'jules-fleet',
    version: '0.0.1',
    description: 'Fleet orchestration for Jules: merge, init, configure',
  },
  subCommands,
});

runMain(main);
