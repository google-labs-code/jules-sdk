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

const JULES_BASE_URL = 'https://jules.google.com';

/**
 * Build a Jules session URL from a session ID.
 */
export function sessionUrl(sessionId: string): string {
  return `${JULES_BASE_URL}/sessions/${sessionId}`;
}

/**
 * Build a Jules repo config URL.
 */
export function repoConfigUrl(owner: string, repo: string): string {
  return `${JULES_BASE_URL}/repo/github/${owner}/${repo}/config`;
}

/**
 * Wrap text in an ANSI hyperlink (OSC 8) for terminals that support it.
 * Falls back to plain text in terminals that don't.
 */
export function ansiLink(text: string, url: string): string {
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}
