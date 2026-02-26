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

import type {
  JulesClient,
  ChangeSetArtifact,
  Activity,
} from '@google/jules-sdk';

export { jules as createJulesClient } from '@google/jules-sdk';

export interface SessionFileInfo {
  path: string;
  changeType: 'created' | 'modified' | 'deleted';
}

/**
 * Get the list of files changed in a Jules session.
 *
 * Dual-mode:
 * - If session is busy (in-progress): aggregates changeSet artifacts from activities
 * - If session is stable (completed): uses the session outcome's changeSet
 *
 * Modeled after packages/mcp/src/functions/code-review.ts#aggregateFromActivities
 */
export async function getSessionChangedFiles(
  client: JulesClient,
  sessionId: string,
): Promise<SessionFileInfo[]> {
  const session = client.session(sessionId);
  await session.activities.hydrate();
  const snapshot = await session.snapshot();

  const isBusy = isBusyState(snapshot.state);

  if (isBusy) {
    return aggregateFromActivities(snapshot.activities ?? []);
  }

  // Stable: use outcome changeSet
  const changeSet =
    typeof snapshot.changeSet === 'function'
      ? (snapshot.changeSet() as ChangeSetArtifact | undefined)
      : undefined;

  if (!changeSet) return [];
  const parsed = changeSet.parsed();
  return parsed.files.map((f) => ({
    path: f.path,
    changeType: f.changeType,
  }));
}

function isBusyState(state: string): boolean {
  const busy = new Set([
    'queued',
    'planning',
    'inProgress',
    'in_progress',
  ]);
  return busy.has(state);
}

function aggregateFromActivities(
  activities: readonly Activity[],
): SessionFileInfo[] {
  const fileMap = new Map<
    string,
    {
      firstChangeType: 'created' | 'modified' | 'deleted';
      latestChangeType: 'created' | 'modified' | 'deleted';
    }
  >();

  for (const activity of activities) {
    for (const artifact of activity.artifacts) {
      if (artifact.type === 'changeSet') {
        const parsed = (artifact as ChangeSetArtifact).parsed();
        for (const file of parsed.files) {
          const existing = fileMap.get(file.path);
          if (existing) {
            existing.latestChangeType = file.changeType;
          } else {
            fileMap.set(file.path, {
              firstChangeType: file.changeType,
              latestChangeType: file.changeType,
            });
          }
        }
      }
    }
  }

  const result: SessionFileInfo[] = [];
  for (const [path, info] of fileMap) {
    // created → deleted = net no change, skip
    if (
      info.firstChangeType === 'created' &&
      info.latestChangeType === 'deleted'
    ) {
      continue;
    }
    const netType =
      info.firstChangeType === 'created' ? 'created' : info.latestChangeType;
    result.push({ path, changeType: netType });
  }
  return result;
}
