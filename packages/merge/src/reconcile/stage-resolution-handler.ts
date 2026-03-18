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

import {
  StageResolutionInputSchema,
  StageResolutionOutputSchema,
} from './schemas.js';
import { readManifest, writeManifest } from './manifest.js';
import { validateFilePath } from '../shared/validators.js';
import crypto from 'crypto';
import fs from 'fs';
import { z } from 'zod';

type StageInput = z.infer<typeof StageResolutionInputSchema>;

/** Resolve file content from inline content, a file path, or default to empty. */
function resolveFileContent(input: StageInput): string {
  if (input.content !== undefined) return input.content;
  if (input.fromFile) {
    if (!fs.existsSync(input.fromFile)) {
      throw new Error(`File not found: ${input.fromFile}`);
    }
    return fs.readFileSync(input.fromFile, 'utf-8');
  }
  return '';
}

export async function stageResolutionHandler(rawInput: unknown) {
  const input = StageResolutionInputSchema.parse(rawInput);
  validateFilePath(input.filePath);
  const fileContent = resolveFileContent(input);

  const manifest = readManifest();
  if (!manifest) {
    throw new Error(
      'No active reconciliation manifest found. Run scan first.',
    );
  }

  // Remove from pending
  manifest.pending = manifest.pending.filter((p) => p !== input.filePath);

  // Add to resolved
  const contentSha = crypto
    .createHash('sha256')
    .update(fileContent)
    .digest('hex');
  const existingIndex = manifest.resolved.findIndex(
    (r) => r.filePath === input.filePath,
  );

  const newResolved = {
    filePath: input.filePath,
    parents: input.parents,
    contentSha,
    note: input.note,
    stagedAt: new Date().toISOString(),
    _stagedContent: fileContent,
  };

  if (existingIndex >= 0) {
    manifest.resolved[existingIndex] = newResolved;
  } else {
    manifest.resolved.push(newResolved);
  }

  if (!input.dryRun) {
    writeManifest(manifest);
  }

  return StageResolutionOutputSchema.parse({
    status: 'staged',
    filePath: input.filePath,
    pending: manifest.pending.length,
    resolved: manifest.resolved.length,
  });
}
