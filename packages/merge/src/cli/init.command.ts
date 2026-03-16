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
import { initHandler } from '../reconcile/init-handler.js';
import { parseJsonInput, getExitCode } from '../shared/errors.js';

export default defineCommand({
  meta: {
    name: 'init',
    description:
      'Write a GitHub Actions workflow for PR overlap detection. ' +
      'Run `jules-merge schema init` to inspect the full input/output schema.',
  },
  args: {
    json: {
      type: 'string',
      description: 'JSON payload matching InitInputSchema. ' +
        'Use `jules-merge schema init` to discover the exact schema. ' +
        'Example: \'{"base":"main","dryRun":true}\'',
      required: true,
    },
  },
  async run({ args }) {
    try {
      const input = parseJsonInput(args.json);
      if (!input) {
        console.error(
          JSON.stringify({
            error: 'Missing --json payload. Run `jules-merge schema init` for the schema.',
          }),
        );
        process.exit(1);
      }
      const result = initHandler(input);
      console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.error(JSON.stringify({ error: err.message }));
      process.exit(getExitCode(err));
    }
  },
});
