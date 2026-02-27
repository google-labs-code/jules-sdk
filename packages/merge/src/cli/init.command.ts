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

import { defineCommand } from 'citty';
import { InitInputSchema } from '../init/init-spec.js';
import { InitHandler } from '../init/init-handler.js';

export default defineCommand({
  meta: {
    name: 'init',
    description:
      'Generate a GitHub Actions workflow for merge conflict detection.',
  },
  args: {
    'output-dir': {
      type: 'string',
      description: 'Directory to write .github/workflows/ into (defaults to .)',
      default: '.',
    },
    'workflow-name': {
      type: 'string',
      description: 'Workflow filename (without .yml)',
      default: 'jules-merge-check',
    },
    'base-branch': {
      type: 'string',
      description: 'Base branch to check against',
      default: 'main',
    },
    force: {
      type: 'boolean',
      description: 'Overwrite existing workflow file',
      default: false,
    },
  },
  async run({ args }) {
    const input = InitInputSchema.parse({
      outputDir: args['output-dir'],
      workflowName: args['workflow-name'],
      baseBranch: args['base-branch'],
      force: args.force,
    });

    const handler = new InitHandler();
    const result = await handler.execute(input);

    if (result.success) {
      console.log(`✅ Created ${result.data.filePath}`);
    } else {
      console.error(`❌ ${result.error.message}`);
      if (result.error.suggestion) {
        console.error(`   ${result.error.suggestion}`);
      }
      process.exit(1);
    }
  },
});
