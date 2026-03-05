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
 * Generate a human-readable link for a source reference.
 * Returns null if the provider/resource combo doesn't have a known URL format.
 *
 * Format: `provider:resource:id` → URL or description
 */
export function formatSourceLink(
  provider: string,
  resource: string,
  id: string,
): string | null {
  if (provider === 'jules' && resource === 'session') {
    return `https://jules.google.com/session/${id}`;
  }
  if (provider === 'github' && resource === 'run') {
    return `GitHub Actions run \`${id}\``;
  }
  return null;
}
