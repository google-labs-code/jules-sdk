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

import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { defineCommand, runMain } from 'citty';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Discovers CLI commands using a build-time manifest (preferred)
 * or runtime directory scanning (fallback for development).
 *
 * The manifest approach ensures reliable command resolution after
 * npm install. The fallback preserves auto-discovery during
 * development so new *.command.ts files are picked up immediately
 * without editing this file (avoids merge conflict hotspot).
 */
async function discoverCommands(): Promise<Record<string, any>> {
  const commands: Record<string, any> = {};

  // Prefer build-time manifest for reliability after npm install
  let names: string[];
  try {
    const manifest = readFileSync(join(__dirname, 'commands.json'), 'utf-8');
    names = JSON.parse(manifest);
  } catch {
    // Fallback: runtime discovery (dev mode — no manifest exists in src/)
    names = readdirSync(__dirname)
      .filter((f) =>
        f.endsWith('.command.ts') || f.endsWith('.command.js') || f.endsWith('.command.mjs'),
    )
      .map((f) => f.replace(/\.command\.(ts|js|mjs)$/, ''));
  }

  for (const name of names) {
    // Try .mjs first (built output), then .ts (dev mode)
    const mjs = join(__dirname, `${name}.command.mjs`);
    const ts = join(__dirname, `${name}.command.ts`);
    try {
      const mod = await import(pathToFileURL(mjs).href);
      commands[name] = mod.default;
    } catch {
      const mod = await import(pathToFileURL(ts).href);
      commands[name] = mod.default;
    }
  }

  return commands;
}

const subCommands = await discoverCommands();

const main = defineCommand({
  meta: {
    name: 'jules-fleet',
    version: '0.0.1',
    description: 'Fleet orchestration for Jules: analyze, dispatch, merge, init, configure',
  },
  subCommands,
});

runMain(main);

