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

import { globSync } from 'glob';

const shared = {
  target: 'node' as const,
  format: 'esm' as const,
  root: './src',
  external: [
    '@google/jules-sdk',
    '@octokit/auth-app',
    '@octokit/rest',
    '@modelcontextprotocol/sdk',
    'citty',
    'zod',
  ],
  outdir: './dist',
  naming: '[dir]/[name].mjs',
};

// Library entry point
await Bun.build({
  ...shared,
  entrypoints: ['./src/index.ts'],
});

// CLI entry points — auto-discover *.command.ts files
const cliEntrypoints = [
  './src/cli/index.ts',
  ...globSync('./src/cli/*.command.ts'),
];

await Bun.build({
  ...shared,
  entrypoints: cliEntrypoints,
});

console.log('✅ Build complete');
