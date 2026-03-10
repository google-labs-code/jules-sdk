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
import { stageResolutionHandler } from '../reconcile/stage-resolution-handler.js';
import { parseJsonInput, getExitCode } from '../shared/errors.js';

export default defineCommand({
  meta: {
    name: 'stage-resolution',
    description: 'Stage a resolved file for the reconciliation commit',
  },
  args: {
    json: {
      type: 'string',
      description: 'Raw JSON payload',
    },
    file: {
      type: 'string',
      description: 'File path within the repo',
    },
    parents: {
      type: 'string',
      description: 'Comma-separated parents: "main,10,11"',
    },
    content: {
      type: 'string',
      description: 'Inline resolved content',
    },
    fromFile: {
      type: 'string',
      description: 'Path to a local file containing the resolved content',
    },
    note: {
      type: 'string',
      description: 'Optional note for the resolution',
    },
    dryRun: {
      type: 'boolean',
      description: 'Validate without writing to the manifest',
      default: false,
    },
  },
  async run({ args }) {
    try {
      const input =
        parseJsonInput(args.json) || {
          filePath: args.file || '',
          parents: args.parents?.split(',') || [],
          content: args.content,
          fromFile: args.fromFile,
          note: args.note,
          dryRun: args.dryRun,
        };
      const result = await stageResolutionHandler(input);
      console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.error(JSON.stringify({ error: err.message }));
      process.exit(getExitCode(err));
    }
  },
});
