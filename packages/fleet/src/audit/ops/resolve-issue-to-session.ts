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

/**
 * Parse the Fleet Context footer from an issue body to extract
 * the source session reference.
 *
 * Delegates to the shared `parseFleetContext` module which owns
 * the footer format. This function maps the parsed result to a
 * session NodeRef when the source is a Jules session.
 *
 * Returns the session NodeRef if found, null otherwise.
 */
export function resolveIssueToSession(
  issueBody: string,
): NodeRef | null {
  const ctx = parseFleetContext(issueBody);
  if (!ctx) return null;

  // Parse provider:resource:id from the source ref
  const parts = ctx.source.split(':');
  if (parts.length < 3) return null;

  const [_provider, resource, ...idParts] = parts;
  const id = idParts.join(':');

  if (!id) return null;

  // Only return session refs (other source types don't map to session nodes)
  if (resource === 'session') {
    return { kind: 'session', id };
  }

  return null;
}
