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
 * Resolve provenance source ref from explicit flag, env vars, or session context.
 *
 * Priority:
 * 1. `flag` — explicit `--source` CLI flag (always wins)
 * 2. `fleetSourceRef` — pre-composed ref from `$FLEET_SOURCE_REF`
 * 3. `julesSessionId` — auto-formatted from `$JULES_SESSION_ID` as `jules:session:{id}`
 */
export function resolveSourceRef(options: {
  flag?: string;
  fleetSourceRef?: string;
  julesSessionId?: string;
}): string | undefined {
  return options.flag
    || options.fleetSourceRef
    || (options.julesSessionId ? `jules:session:${options.julesSessionId}` : undefined);
}
