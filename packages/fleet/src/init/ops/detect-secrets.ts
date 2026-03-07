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
 * Known secret env var mappings.
 * Each entry: [secretName, ...envVarCandidates] (first match wins).
 */
const SECRET_MAPPINGS: [string, ...string[]][] = [
  ['JULES_API_KEY', 'JULES_API_KEY'],
  ['FLEET_APP_ID', 'FLEET_APP_ID', 'GITHUB_APP_ID'],
  ['FLEET_APP_PRIVATE_KEY', 'FLEET_APP_PRIVATE_KEY', 'GITHUB_APP_PRIVATE_KEY_BASE64'],
  ['FLEET_APP_INSTALLATION_ID', 'FLEET_APP_INSTALLATION_ID', 'GITHUB_APP_INSTALLATION_ID'],
];

/**
 * Auto-detect secrets from environment variables.
 *
 * Returns a record of secret names to their values. Only secrets
 * with non-empty env var values are included. For each secret,
 * the first matching env var candidate wins (e.g. FLEET_APP_ID
 * is preferred over GITHUB_APP_ID).
 *
 * @param allowlist - If provided, only secrets whose names are in
 *   this list will be returned. If undefined, all detected secrets
 *   are returned. An empty array returns no secrets.
 */
export function detectSecretsFromEnv(allowlist?: string[]): Record<string, string> {
  const secrets: Record<string, string> = {};

  for (const [secretName, ...envVars] of SECRET_MAPPINGS) {
    if (allowlist && !allowlist.includes(secretName)) continue;
    for (const envVar of envVars) {
      const value = process.env[envVar];
      if (value) {
        secrets[secretName] = value;
        break;
      }
    }
  }

  return secrets;
}
