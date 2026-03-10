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

import { z } from 'zod';

// ─── Scan ───────────────────────────────────────────────────────

export const ScanInputSchema = z.object({
  prs: z.array(z.number()),
  repo: z.string(),
  base: z.string().optional(),
  includeClean: z.boolean().optional(),
});

export const ScanOutputSchema = z.object({
  status: z.enum(['conflicts', 'clean']),
  base: z.object({
    branch: z.string(),
    sha: z.string(),
  }),
  prs: z.array(
    z.object({
      id: z.number(),
      headSha: z.string(),
      branch: z.string(),
      files: z.array(z.string()),
    }),
  ),
  hotZones: z.array(
    z.object({
      filePath: z.string(),
      competingPrs: z.array(z.number()),
      changeType: z.enum(['modified', 'added', 'deleted']),
    }),
  ),
  cleanFiles: z.array(
    z.object({
      filePath: z.string(),
      sourcePr: z.number(),
    }),
  ),
});

// ─── Get Contents ───────────────────────────────────────────────

export const GetContentsInputSchema = z.object({
  filePath: z.string(),
  source: z.string(),
  repo: z.string(),
  baseSha: z.string().optional(),
});

export const GetContentsOutputSchema = z.object({
  filePath: z.string(),
  source: z.string(),
  sha: z.string(),
  content: z.string(),
  encoding: z.literal('utf-8'),
  totalLines: z.number(),
});

// ─── Stage Resolution ───────────────────────────────────────────

export const StageResolutionInputSchema = z
  .object({
    filePath: z.string(),
    parents: z.array(z.string()),
    content: z.string().optional(),
    fromFile: z.string().optional(),
    note: z.string().optional(),
    dryRun: z.boolean().optional(),
  })
  .refine((data) => data.content !== undefined || data.fromFile !== undefined, {
    message: 'Either content or fromFile must be provided',
  });

export const StageResolutionOutputSchema = z.object({
  status: z.literal('staged'),
  filePath: z.string(),
  pending: z.number(),
  resolved: z.number(),
});

// ─── Status ─────────────────────────────────────────────────────

export const StatusInputSchema = z.object({
  manifest: z.string().optional(),
});

export const StatusOutputSchema = z.object({
  batchId: z.string(),
  ready: z.boolean(),
  resolved: z.array(
    z.object({
      filePath: z.string(),
      parents: z.array(z.string()),
      note: z.string().optional(),
    }),
  ),
  pending: z.array(
    z.object({
      filePath: z.string(),
      competingPrs: z.array(z.number()),
    }),
  ),
  cleanFiles: z.array(
    z.object({
      filePath: z.string(),
      sourcePr: z.number(),
      changeType: z.enum(['modified', 'added', 'deleted']).optional(),
    }),
  ),
});

// ─── Merge ──────────────────────────────────────────────────────

export const MergeInputSchema = z.object({
  pr: z.number(),
  repo: z.string(),
});

export const MergeOutputSchema = z.object({
  status: z.literal('merged'),
  pr: z.number(),
  sha: z.string(),
  url: z.string(),
});

// ─── Push ───────────────────────────────────────────────────────

export const PushInputSchema = z.object({
  branch: z.string(),
  message: z.string(),
  repo: z.string(),
  dryRun: z.boolean().optional(),
  prTitle: z.string().optional(),
  prBody: z.string().optional(),
  mergeStrategy: z
    .enum(['sequential', 'octopus'])
    .default('sequential')
    .optional(),
});

export const PushOutputSchema = z.object({
  status: z.enum(['pushed', 'dry-run']),
  commitSha: z.string().optional(),
  branch: z.string().optional(),
  pullRequest: z
    .object({
      number: z.number(),
      url: z.string(),
      title: z.string(),
    })
    .optional(),
  parents: z.array(z.string()),
  mergeChain: z
    .array(
      z.object({
        commitSha: z.string(),
        parents: z.array(z.string()),
        prId: z.number(),
      }),
    )
    .optional(),
  filesUploaded: z.number(),
  filesCarried: z.number(),
  warnings: z.array(z.string()).optional(),
});
