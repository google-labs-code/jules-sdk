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

import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const auditDir = join(__dirname, '..', 'cli', 'audit');

describe('Audit subcommand discovery', () => {
  it('audit directory exists with subcommand files', () => {
    expect(existsSync(auditDir)).toBe(true);
  });

  it('discovers scan, inspect, and list subcommand files', () => {
    const files = readdirSync(auditDir);
    const subcommandNames = files
      .filter((f) => f.endsWith('.subcommand.ts'))
      .map((f) => f.replace('.subcommand.ts', ''));

    expect(subcommandNames).toContain('scan');
    expect(subcommandNames).toContain('inspect');
    expect(subcommandNames).toContain('list');
  });

  it('subcommand files export a default citty command', async () => {
    const subcommandFiles = readdirSync(auditDir).filter((f) =>
      f.endsWith('.subcommand.ts'),
    );

    for (const file of subcommandFiles) {
      const mod = await import(join(auditDir, file));
      expect(mod.default).toBeDefined();
      expect(mod.default.meta).toBeDefined();
      expect(mod.default.meta.name).toBeTruthy();
    }
  });
});
