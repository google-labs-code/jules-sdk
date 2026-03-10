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

import { StatusInputSchema, StatusOutputSchema } from './schemas.js';
import { readManifest } from './manifest.js';

export async function statusHandler(rawInput: any) {
  const input = StatusInputSchema.parse(rawInput);

  const manifest = readManifest();
  if (!manifest) {
    throw new Error('No active reconciliation manifest found.');
  }

  const hotZoneMap = new Map(
    (manifest.hotZones ?? []).map((hz) => [hz.filePath, hz.competingPrs]),
  );

  const pending = manifest.pending.map((filePath) => ({
    filePath,
    competingPrs:
      hotZoneMap.get(filePath) ?? manifest.prs.map((p) => p.id),
  }));

  const ready = manifest.pending.length === 0;

  return StatusOutputSchema.parse({
    batchId: manifest.batchId,
    ready,
    resolved: manifest.resolved.map((r) => ({
      filePath: r.filePath,
      parents: r.parents,
      note: r.note,
    })),
    pending,
    cleanFiles: manifest.cleanFiles,
  });
}
