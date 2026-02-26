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

/** Init domain events */
export type InitEvent =
  | { type: 'init:start'; owner: string; repo: string }
  | { type: 'init:branch:creating'; name: string; base: string }
  | { type: 'init:branch:created'; name: string }
  | { type: 'init:file:committed'; path: string }
  | { type: 'init:file:skipped'; path: string; reason: string }
  | { type: 'init:pr:creating' }
  | { type: 'init:pr:created'; url: string; number: number }
  | { type: 'init:done'; prUrl: string; files: string[]; labels: string[] }
  // Wizard events
  | { type: 'init:auth:detected'; method: 'token' | 'app' }
  | { type: 'init:secret:uploading'; name: string }
  | { type: 'init:secret:uploaded'; name: string }
  | { type: 'init:secret:skipped'; name: string; reason: string }
  | { type: 'init:dry-run'; files: string[] }
  | { type: 'init:already-initialized' };
