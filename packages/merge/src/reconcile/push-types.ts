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

import { Octokit } from '@octokit/rest';
import type { Manifest } from './manifest.js';
import { z } from 'zod';
import { PushInputSchema } from './schemas.js';

export type PushInput = z.infer<typeof PushInputSchema>;

export interface PushContext {
  octokit: Octokit;
  input: PushInput;
  owner: string;
  repo: string;
  manifest: Manifest;
  baseBranchName: string;
  baseSha: string;
  baseTreeSha: string;
  warnings: string[];
}

export interface TreeResult {
  overlay: any[];
  filesUploaded: number;
  filesCarried: number;
}

export interface CommitResult {
  finalSha: string;
  parents: string[];
  mergeChain?: { commitSha: string; parents: string[]; prId: number }[];
}
