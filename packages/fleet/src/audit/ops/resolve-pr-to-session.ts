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
import { parseFleetContext } from '../../shared/fleet-context.js';

/** Prefix for session IDs in Jules branch names and refs. */
const SESSION_ID_PREFIX = 's-';

/**
 * Session ID extraction strategies, tried in priority order.
 * Each returns a function that attempts to extract a session NodeRef.
 *
 * Strategy 1: Branch name convention (Jules branches: `jules/.../s-xxx`)
 * Strategy 2: Fleet Context footer in PR body (shared contract parser)
 * Strategy 3: Jules session URL in PR body (external format)
 */
const strategies: Array<(prBody: string, headRef: string) => NodeRef | null> = [
  // 1. Branch name — last path segment starting with "s-"
  (_prBody, headRef) => {
    const lastSlash = headRef.lastIndexOf('/');
    if (lastSlash === -1) return null;

    const lastSegment = headRef.slice(lastSlash + 1);
    if (lastSegment.startsWith(SESSION_ID_PREFIX)) {
      return { kind: 'session', id: lastSegment };
    }
    return null;
  },

  // 2. Fleet Context footer — uses the shared contract parser
  (prBody, _headRef) => {
    const ctx = parseFleetContext(prBody);
    if (!ctx) return null;

    const parts = ctx.source.split(':');
    if (parts.length < 3) return null;

    const [_provider, resource, ...idParts] = parts;
    const id = idParts.join(':');
    if (resource === 'session' && id) {
      return { kind: 'session', id };
    }
    return null;
  },

  // 3. Jules session URL — extract session ID from known URL format
  (prBody, _headRef) => {
    const urlPrefix = 'jules.google.com/session/';
    const urlIndex = prBody.indexOf(urlPrefix);
    if (urlIndex === -1) return null;

    const afterPrefix = prBody.slice(urlIndex + urlPrefix.length);
    const sessionId = takeUntilDelimiter(afterPrefix);

    if (sessionId.startsWith(SESSION_ID_PREFIX)) {
      return { kind: 'session', id: sessionId };
    }
    return null;
  },
];

/**
 * Extract session ID from a PR body or branch name.
 *
 * Jules PRs typically have the session ID in:
 * 1. The branch name: `jules/fix-issue-42/s-abc123` (last segment after `/`)
 * 2. The PR body: Fleet Context footer (shared contract parser)
 * 3. The PR body: contains a `jules.google.com/session/s-xxx` URL
 *
 * Returns the session NodeRef if found, null otherwise.
 */
export function resolvePRToSession(
  prBody: string,
  headRef: string,
): NodeRef | null {
  for (const strategy of strategies) {
    const result = strategy(prBody, headRef);
    if (result) return result;
  }
  return null;
}

/**
 * Extract characters until the first delimiter or end of string.
 * Delimiters are characters that naturally terminate a session ID
 * in markdown body text.
 */
function takeUntilDelimiter(str: string): string {
  const delimiters = [' ', '\n', '\t', '\r', '`', ')', ']', '>'];
  let end = str.length;
  for (const d of delimiters) {
    const idx = str.indexOf(d);
    if (idx !== -1 && idx < end) {
      end = idx;
    }
  }
  return str.slice(0, end);
}
