/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// src/storage/root.ts
import { homedir } from 'node:os';
import { accessSync, constants, existsSync } from 'node:fs';
import * as path from 'node:path';

export function isWritable(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function getRootDir(): string {
  // 1. Explicit environment variable (highest priority)
  const julesHome = process.env.JULES_HOME;
  if (julesHome && isWritable(julesHome)) {
    return julesHome;
  }

  // 2. Project-first: If package.json exists in cwd, use project-local cache
  const cwd = process.cwd();
  const isInProject = existsSync(path.join(cwd, 'package.json'));
  if (isInProject && cwd !== '/' && isWritable(cwd)) {
    return cwd;
  }

  // 3. HOME environment variable
  const home = process.env.HOME;
  if (home && home !== '/' && isWritable(home)) {
    return home;
  }

  // 4. os.homedir() (may use /etc/passwd on Unix)
  const osHome = homedir();
  if (osHome && osHome !== '/' && isWritable(osHome)) {
    return osHome;
  }

  // 5. Temporary directory as last resort
  const tmpDir = process.env.TMPDIR || process.env.TMP || '/tmp';
  return tmpDir;
}
