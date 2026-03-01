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

import type { SessionTrace, TraceScores } from './spec.js';

/**
 * Compute evaluation scores for a single session trace.
 * Pure function — no side effects.
 */
export function computeScores(session: SessionTrace): TraceScores {
  return {
    mergeSuccess: session.pullRequest?.merged ?? null,
    filesChanged: session.changedFiles.length,
    issueLinked: session.dispatchedBy !== null,
  };
}

/**
 * Aggregate evaluation scores across multiple session traces.
 * Pure function — no side effects.
 */
export function aggregateScores(sessions: SessionTrace[]): TraceScores {
  const merged = sessions.filter((s) => s.pullRequest?.merged);
  const totalFiles = sessions.reduce(
    (sum, s) => sum + s.changedFiles.length,
    0,
  );
  const linked = sessions.filter((s) => s.dispatchedBy !== null);

  return {
    mergeSuccess: sessions.length > 0 ? merged.length === sessions.length : null,
    filesChanged: totalFiles,
    issueLinked: linked.length === sessions.length,
  };
}
