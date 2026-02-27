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

import { mkdir, writeFile, access, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { InitSpec, InitInput, InitResult } from './init-spec.js';
import { ok, fail } from '../shared/result.js';
import { buildWorkflowYaml } from './templates.js';

export class InitHandler implements InitSpec {
  async execute(input: InitInput): Promise<InitResult> {
    try {
      const outputDir = resolve(input.outputDir);

      // 1. Validate output directory exists
      try {
        const stats = await stat(outputDir);
        if (!stats.isDirectory()) {
          return fail(
            'DIRECTORY_NOT_FOUND',
            `${outputDir} is not a directory.`,
            true,
            'Provide a valid directory path with --output-dir.',
          );
        }
      } catch {
        return fail(
          'DIRECTORY_NOT_FOUND',
          `Directory does not exist: ${outputDir}`,
          true,
          'Create the directory first or provide a valid path.',
        );
      }

      // 2. Resolve workflow file path
      const workflowDir = join(outputDir, '.github', 'workflows');
      const filePath = join(workflowDir, `${input.workflowName}.yml`);

      // 3. Check if file already exists (unless force)
      if (!input.force) {
        try {
          await access(filePath);
          return fail(
            'FILE_ALREADY_EXISTS',
            `Workflow file already exists: ${filePath}`,
            true,
            'Use --force to overwrite.',
          );
        } catch {
          // File doesn't exist — good
        }
      }

      // 4. Generate content
      const content = buildWorkflowYaml({
        workflowName: input.workflowName,
        baseBranch: input.baseBranch,
      });

      // 5. Write file
      try {
        await mkdir(workflowDir, { recursive: true });
        await writeFile(filePath, content, 'utf-8');
      } catch (error: any) {
        return fail(
          'WRITE_FAILED',
          `Failed to write workflow file: ${error.message}`,
          true,
        );
      }

      return ok({ filePath, content });
    } catch (error: any) {
      return fail(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }
  }
}
