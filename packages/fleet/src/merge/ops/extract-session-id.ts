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
 * Extracts the Jules session ID from a branch name.
 *
 * Jules-created branches follow the pattern: `<description>-<sessionId>`
 * where the session ID is a long trailing numeric segment (10+ digits).
 *
 * Examples:
 *   fix-65-66-resolve-conflicts-15481661885092594092 → "15481661885092594092"
 *   fix-3-api-2184426524618245113 → "2184426524618245113"
 *   feat/my-feature → null
 */
export function extractSessionId(branchName: string): string | null {
  const match = branchName.match(/-(\d{10,})$/);
  return match ? match[1] : null;
}
