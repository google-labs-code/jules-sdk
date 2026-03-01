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

/**
 * Pre-publish guard: ensures no workspace: protocol references leak
 * into the published package. Run automatically via prepublishOnly.
 */

import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

const workspaceRefs = Object.entries(deps).filter(
  ([, version]) => typeof version === 'string' && version.startsWith('workspace:'),
);

if (workspaceRefs.length > 0) {
  console.error('\n❌ Cannot publish: workspace: protocol references found:\n');
  for (const [name, version] of workspaceRefs) {
    console.error(`   ${name}: ${version}`);
  }
  console.error('\nReplace with published versions before publishing.\n');
  process.exit(1);
}

console.log('✅ No workspace: references found — safe to publish.');
