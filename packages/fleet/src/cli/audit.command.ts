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

/**
 * CLI command: `jules-fleet audit`
 *
 * Uses auto-registration: subcommands are discovered from
 * `./audit/*.subcommand.{ts,js,mjs}` files. To add a new subcommand,
 * create a file matching that pattern — no edits to this file needed.
 *
 * Grammar: `audit <action> <resource-type> [resource-id] [--flags]`
 *
 * Actions (auto-discovered from subcommand files):
 *   scan         Full audit scan (default)
 *   inspect      Lineage graph for a specific item
 *   list         Query operations
 */

import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { defineCommand } from 'citty';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Discover audit subcommands from `./audit/*.subcommand.{ts,js,mjs}` files.
 * Convention: filename before `.subcommand` becomes the subcommand name.
 *
 * This pattern eliminates the audit.command.ts file as a merge conflict
 * hotspot — new subcommands only require adding a new file.
 */
async function discoverAuditSubcommands(): Promise<Record<string, any>> {
  const subcommands: Record<string, any> = {};
  const auditDir = join(__dirname, 'audit');

  let files: string[];
  try {
    files = readdirSync(auditDir);
  } catch {
    // Directory doesn't exist yet (development)
    return subcommands;
  }

  const subcommandFiles = files.filter(
    (f) =>
      f.endsWith('.subcommand.ts') ||
      f.endsWith('.subcommand.js') ||
      f.endsWith('.subcommand.mjs'),
  );

  for (const file of subcommandFiles) {
    const name = file.replace(/\.subcommand\.(ts|js|mjs)$/, '');
    const fullPath = join(auditDir, file);
    try {
      const mod = await import(pathToFileURL(fullPath).href);
      subcommands[name] = mod.default;
    } catch {
      // Skip broken subcommands in dev — don't crash the CLI
    }
  }

  return subcommands;
}

const subCommands = await discoverAuditSubcommands();

export default defineCommand({
  meta: {
    name: 'audit',
    description: 'Audit fleet items: scan for findings, inspect lineage, list resources',
  },
  subCommands,
});
