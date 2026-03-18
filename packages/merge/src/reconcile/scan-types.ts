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
 * Shared types for the scan pipeline, derived from Zod schemas.
 */

import { Octokit } from '@octokit/rest';
import { z } from 'zod';
import { ScanInputSchema, ScanOutputSchema } from './schemas.js';

export type ScanInput = z.infer<typeof ScanInputSchema>;
export type ScanOutput = z.infer<typeof ScanOutputSchema>;
export type HotZone = ScanOutput['hotZones'][number];
export type CleanFile = ScanOutput['cleanFiles'][number];

export interface ScanContext {
  octokit: Octokit;
  input: ScanInput;
  owner: string;
  repo: string;
  baseBranchName: string;
  baseSha: string;
}
