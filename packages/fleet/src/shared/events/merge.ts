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

/** Merge domain events */
export type MergeEvent =
  | { type: 'merge:start'; owner: string; repo: string; mode: string; prCount: number }
  | { type: 'merge:no-prs' }
  | { type: 'merge:pr:processing'; number: number; title: string; retry?: number }
  | { type: 'merge:branch:updating'; prNumber: number }
  | { type: 'merge:branch:updated'; prNumber: number }
  | { type: 'merge:ci:waiting'; prNumber: number }
  | { type: 'merge:ci:check'; name: string; status: 'pass' | 'fail' | 'pending'; duration?: number }
  | { type: 'merge:ci:passed'; prNumber: number }
  | { type: 'merge:ci:failed'; prNumber: number }
  | { type: 'merge:ci:timeout'; prNumber: number }
  | { type: 'merge:ci:none'; prNumber: number }
  | { type: 'merge:pr:merging'; prNumber: number }
  | { type: 'merge:pr:merged'; prNumber: number }
  | { type: 'merge:pr:skipped'; prNumber: number; reason: string }
  | { type: 'merge:conflict:detected'; prNumber: number }
  | { type: 'merge:redispatch:start'; oldPr: number }
  | { type: 'merge:redispatch:waiting'; oldPr: number }
  | { type: 'merge:redispatch:done'; oldPr: number; newPr: number }
  | {
      type: 'merge:done';
      merged: number[];
      skipped: number[];
      redispatched: Array<{ oldPr: number; newPr: number }>;
    };
