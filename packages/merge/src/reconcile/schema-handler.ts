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

import { zodToJsonSchema } from 'zod-to-json-schema';
import * as schemas from './schemas.js';

export function schemaHandler(command?: string, options?: any) {
  const schemaMap: Record<string, { input: any; output: any }> = {
    scan: {
      input: schemas.ScanInputSchema,
      output: schemas.ScanOutputSchema,
    },
    'get-contents': {
      input: schemas.GetContentsInputSchema,
      output: schemas.GetContentsOutputSchema,
    },
    'stage-resolution': {
      input: schemas.StageResolutionInputSchema,
      output: schemas.StageResolutionOutputSchema,
    },
    status: {
      input: schemas.StatusInputSchema,
      output: schemas.StatusOutputSchema,
    },
    push: {
      input: schemas.PushInputSchema,
      output: schemas.PushOutputSchema,
    },
    merge: {
      input: schemas.MergeInputSchema,
      output: schemas.MergeOutputSchema,
    },
  };

  if (options?.all) {
    const allSchemas: any = {};
    for (const [cmd, pair] of Object.entries(schemaMap)) {
      allSchemas[cmd] = {
        input: zodToJsonSchema(pair.input, `${cmd}Input`),
        output: zodToJsonSchema(pair.output, `${cmd}Output`),
      };
    }
    return allSchemas;
  }

  if (!command) {
    throw new Error('Must provide a command name or use --all');
  }

  if (!schemaMap[command]) {
    throw new Error(`Unknown command: ${command}`);
  }

  return {
    input: zodToJsonSchema(schemaMap[command].input, `${command}Input`),
    output: zodToJsonSchema(
      schemaMap[command].output,
      `${command}Output`,
    ),
  };
}
