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

import type { Octokit } from 'octokit';
import type { AuditInput } from '../spec.js';
import type { NodeRef } from '../graph/types.js';
import { listUndispatchedIssues } from '../ops/list-undispatched-issues.js';

/**
 * Step 1: Resolve the input entry point into concrete node references.
 */
export async function resolveEntryPoints(
  octokit: Octokit,
  input: AuditInput,
): Promise<NodeRef[]> {
  const ep = input.entryPoint;

  switch (ep.kind) {
    case 'issue':
      return [{ kind: 'issue', id: ep.id }];
    case 'pr':
      return [{ kind: 'pr', id: ep.id }];
    case 'milestone':
      return [{ kind: 'milestone', id: ep.id }];
    case 'full': {
      // For full scan, start from undispatched issues
      const undispatched = await listUndispatchedIssues(
        octokit,
        input.owner,
        input.repo,
      );
      return undispatched.map((i) => ({
        kind: 'issue' as const,
        id: String(i.number),
      }));
    }
  }
}
