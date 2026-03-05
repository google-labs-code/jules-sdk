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

import type { AuditInput } from '../../audit/spec.js';
import { AuditInputSchema } from '../../audit/spec.js';
import { getGitRepoInfo } from '../../shared/auth/git.js';
import { z } from 'zod';

export type FixMode = 'off' | 'dry-run' | 'apply';

// ── CLI ARGS SCHEMA ────────────────────────────────────────────────

export const ScanArgsSchema = z.object({
  owner: z.string().optional(),
  repo: z.string().optional(),
  milestone: z.string().optional(),
  issue: z.string().optional(),
  pr: z.string().optional(),
  fix: z.boolean().default(false),
  apply: z.boolean().default(false),
  depth: z.string().default('2'),
  json: z.boolean().default(false),
  graph: z.boolean().default(false),
  output: z.string().optional(),
  fixable: z.boolean().default(false),
  severity: z.enum(['error', 'warning', 'info']).optional(),
});
export type ScanArgs = z.infer<typeof ScanArgsSchema>;

/**
 * Derive fixMode from CLI flags.
 */
export function deriveFixMode(args: Pick<ScanArgs, 'fix' | 'apply'>): FixMode {
  if (args.fix && args.apply) return 'apply';
  if (args.fix) return 'dry-run';
  return 'off';
}

/**
 * Build a validated AuditInput from CLI args.
 */
export async function buildAuditInput(args: ScanArgs): Promise<{ input: AuditInput; useJson: boolean; fixMode: FixMode }> {
  let owner = args.owner;
  let repo = args.repo;
  if (!owner || !repo) {
    const repoInfo = await getGitRepoInfo();
    owner = owner || repoInfo.owner;
    repo = repo || repoInfo.repo;
  }

  // Determine entry point
  let entryPoint: any = { kind: 'full' };
  if (args.milestone) entryPoint = { kind: 'milestone', id: args.milestone };
  if (args.issue) entryPoint = { kind: 'issue', id: args.issue };
  if (args.pr) entryPoint = { kind: 'pr', id: args.pr };

  const useJson = args.json || args.graph;
  const fixMode = deriveFixMode(args);

  const input = AuditInputSchema.parse({
    owner,
    repo,
    entryPoint,
    fixMode,
    depth: Number(args.depth),
    format: useJson ? 'json' : 'human',
    includeGraph: args.graph,
  });

  return { input, useJson, fixMode };
}
