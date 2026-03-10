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

import fs from 'fs';
import path from 'path';
import { z } from 'zod';

export const ManifestSchema = z.object({
  batchId: z.string(),
  createdAt: z.string(),
  repo: z.string(),
  base: z.object({
    branch: z.string(),
    sha: z.string(),
  }),
  prs: z.array(
    z.object({
      id: z.number(),
      headSha: z.string(),
      branch: z.string(),
    }),
  ),
  resolved: z.array(
    z.object({
      filePath: z.string(),
      parents: z.array(z.string()),
      contentSha: z.string(),
      note: z.string().optional(),
      stagedAt: z.string(),
      _stagedContent: z.string().optional(),
    }),
  ),
  hotZones: z
    .array(
      z.object({
        filePath: z.string(),
        competingPrs: z.array(z.number()),
        changeType: z.enum(['modified', 'added', 'deleted']),
      }),
    )
    .optional(),
  pending: z.array(z.string()),
  cleanFiles: z.array(
    z.object({
      filePath: z.string(),
      sourcePr: z.number(),
      changeType: z.enum(['modified', 'added', 'deleted']).optional(),
    }),
  ),
});

export type Manifest = z.infer<typeof ManifestSchema>;

const MANIFEST_PATH =
  process.env.JULES_MERGE_MANIFEST_PATH ||
  path.join(process.cwd(), '.jules', 'merge', 'manifest.json');

export function getManifestPath(): string {
  return MANIFEST_PATH;
}

export function readManifest(): Manifest | null {
  try {
    // One-time migration: .jules-merge/ → .jules/merge/
    const legacyPath = path.join(
      process.cwd(),
      '.jules-merge',
      'manifest.json',
    );
    if (!fs.existsSync(MANIFEST_PATH) && fs.existsSync(legacyPath)) {
      const dir = path.dirname(MANIFEST_PATH);
      fs.mkdirSync(dir, { recursive: true });
      fs.renameSync(legacyPath, MANIFEST_PATH);
    }

    if (!fs.existsSync(MANIFEST_PATH)) {
      return null;
    }
    const data = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    const json = JSON.parse(data);
    return ManifestSchema.parse(json);
  } catch (err) {
    return null;
  }
}

export function writeManifest(manifest: Manifest): void {
  const dir = path.dirname(MANIFEST_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
}
