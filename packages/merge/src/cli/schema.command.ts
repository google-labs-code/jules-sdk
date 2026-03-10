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
import { schemaHandler } from '../reconcile/schema-handler.js';

export default defineCommand({
  meta: {
    name: 'schema',
    description: 'Print JSON schema for a command (input/output)',
  },
  args: {
    command: {
      type: 'positional',
      description: 'Command name (scan, get-contents, stage-resolution, status, push, merge)',
      required: false,
    },
    all: {
      type: 'boolean',
      description: 'Print all schemas at once',
      default: false,
    },
  },
  async run({ args }) {
    const result = schemaHandler(args.command, { all: args.all });
    console.log(JSON.stringify(result, null, 2));
  },
});
