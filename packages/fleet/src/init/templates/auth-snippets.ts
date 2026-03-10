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
 * Auth-agnostic env block for workflow templates.
 *
 * All secrets are ALWAYS passed as env vars. The fleet CLI resolves auth
 * internally via getAuthOptions() — no decode step or create-github-app-token
 * action needed. Missing secrets are empty strings (harmless).
 */
export function fleetEnvBlock(): string {
  return `
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          JULES_API_KEY: \${{ secrets.JULES_API_KEY }}
          FLEET_APP_ID: \${{ secrets.FLEET_APP_ID }}
          FLEET_APP_PRIVATE_KEY_BASE64: \${{ secrets.FLEET_APP_PRIVATE_KEY_BASE64 }}
          FLEET_APP_INSTALLATION_ID: \${{ secrets.FLEET_APP_INSTALLATION_ID }}`;
}
