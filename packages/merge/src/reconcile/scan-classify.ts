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

/**
 * File classification ops — partitions a file→PRs map into
 * hot zones (conflicts) and clean files (single-owner).
 */

import type { HotZone, CleanFile } from './scan-types.js';

type ChangeType = 'modified' | 'added' | 'deleted';

function toChangeType(status: string): ChangeType {
  if (status === 'removed') return 'deleted';
  if (status === 'added') return 'added';
  return 'modified';
}

export interface ClassificationResult {
  hotZones: HotZone[];
  cleanFiles: CleanFile[];
}

export function classifyFiles(
  fileToPrs: Map<string, { prs: number[]; status: string }>,
): ClassificationResult {
  const hotZones: HotZone[] = [];
  const cleanFiles: CleanFile[] = [];

  for (const [filePath, data] of fileToPrs.entries()) {
    if (data.prs.length > 1) {
      hotZones.push({
        filePath,
        competingPrs: data.prs,
        changeType: toChangeType(data.status),
      });
    } else {
      cleanFiles.push({
        filePath,
        sourcePr: data.prs[0],
      });
    }
  }

  return { hotZones, cleanFiles };
}
