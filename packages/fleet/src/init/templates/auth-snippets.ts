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
 * Shared YAML snippets for GitHub App authentication in workflow templates.
 *
 * These are only included when auth=app. In token mode, the workflow relies
 * on the runner's GITHUB_TOKEN, and getAuthOptions() should NOT see FLEET_APP_*
 * env vars (which would cause it to prefer App auth).
 */

/** FLEET_APP_* env vars for the run step (only for auth=app). */
export function fleetAppEnv(auth: 'token' | 'app'): string {
  if (auth !== 'app') return '';
  return `
          FLEET_APP_ID: \${{ secrets.FLEET_APP_ID }}
          FLEET_APP_PRIVATE_KEY: \${{ secrets.FLEET_APP_PRIVATE_KEY }}
          FLEET_APP_INSTALLATION_ID: \${{ secrets.FLEET_APP_INSTALLATION_ID }}`;
}

/** Decode-key + app-token steps (only for auth=app). */
export function fleetAppSteps(auth: 'token' | 'app'): string {
  if (auth !== 'app') return '';
  return `
      - name: Decode private key
        id: decode-key
        run: |
          echo "\${{ secrets.FLEET_APP_PRIVATE_KEY }}" | base64 -d > /tmp/fleet-app-key.pem
          {
            echo "pem<<PEMEOF"
            cat /tmp/fleet-app-key.pem
            echo "PEMEOF"
          } >> "\$GITHUB_OUTPUT"
          rm /tmp/fleet-app-key.pem
      - name: Generate Fleet App token
        id: app-token
        uses: actions/create-github-app-token@v1
        with:
          app-id: \${{ secrets.FLEET_APP_ID }}
          private-key: \${{ steps.decode-key.outputs.pem }}`;
}

/** GITHUB_TOKEN expression — app-token output for auth=app, secrets.GITHUB_TOKEN for token. */
export function githubTokenExpr(auth: 'token' | 'app'): string {
  return auth === 'app' ? 'steps.app-token.outputs.token' : 'secrets.GITHUB_TOKEN';
}
