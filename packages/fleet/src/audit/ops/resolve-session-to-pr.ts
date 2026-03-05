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

import type { NodeRef } from '../graph/types.js';

/**
 * Resolve session → PR by checking the session state from the Jules API.
 *
 * The Jules session state includes PR information when a session has
 * created one. Returns the PR NodeRef if found, null if the session
 * hasn't produced a PR yet (which is legitimate, not an error).
 */
export function resolveSessionToPR(
  sessionState: { pr?: { number: number } | null },
): NodeRef | null {
  if (sessionState.pr?.number) {
    return { kind: 'pr', id: String(sessionState.pr.number) };
  }
  return null;
}
