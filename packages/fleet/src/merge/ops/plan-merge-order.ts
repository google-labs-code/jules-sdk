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

import type { Octokit } from 'octokit';
import type { PR } from '../../shared/schemas/pr.js';
import { UnionFind } from '../../shared/union-find.js';

// ── Types ───────────────────────────────────────────────────────────

export interface ConflictGroup {
  /** PRs in this conflict cluster, ordered by ascending overlap score */
  prs: PR[];
  /** Files shared between PRs in this cluster */
  sharedFiles: string[];
}

export interface MergePlan {
  /** PRs with no file overlap — safe to merge independently */
  independent: PR[];
  /** Groups of PRs that share files — will likely conflict when merged sequentially */
  conflictGroups: ConflictGroup[];
}

// ── Pure Functions (independently testable) ─────────────────────────

/**
 * Build a map of file → PR numbers that touch it.
 * Pure function — no side effects.
 */
export function buildPRFileOwnership(
  prFiles: Map<number, string[]>,
): Map<string, number[]> {
  const ownership = new Map<string, number[]>();
  for (const [prNumber, files] of prFiles) {
    for (const file of files) {
      if (!ownership.has(file)) {
        ownership.set(file, []);
      }
      ownership.get(file)!.push(prNumber);
    }
  }
  return ownership;
}

/**
 * Extract files owned by 2+ PRs from the ownership map.
 * Pure function — no side effects.
 */
export function detectPROverlaps(
  ownership: Map<string, number[]>,
): Array<{ file: string; prs: number[] }> {
  const overlaps: Array<{ file: string; prs: number[] }> = [];
  for (const [file, prs] of ownership) {
    if (prs.length > 1) {
      overlaps.push({ file, prs: [...prs].sort((a, b) => a - b) });
    }
  }
  return overlaps;
}

/**
 * Partition PRs into independent (no shared files) and conflict groups
 * (connected via union-find through shared files).
 * Pure function — no side effects.
 */
export function partitionPRs(
  prs: PR[],
  prFiles: Map<number, string[]>,
): MergePlan {
  if (prs.length === 0) {
    return { independent: [], conflictGroups: [] };
  }

  const ownership = buildPRFileOwnership(prFiles);
  const overlaps = detectPROverlaps(ownership);

  if (overlaps.length === 0) {
    // No overlaps — all PRs are independent
    // Sort by ascending file count, then by PR number
    const sorted = [...prs].sort((a, b) => {
      const aFiles = prFiles.get(a.number)?.length ?? 0;
      const bFiles = prFiles.get(b.number)?.length ?? 0;
      return aFiles - bFiles || a.number - b.number;
    });
    return { independent: sorted, conflictGroups: [] };
  }

  // Build union-find to cluster PRs by shared files
  const uf = new UnionFind<number>();
  for (const pr of prs) {
    uf.makeSet(pr.number);
  }
  for (const overlap of overlaps) {
    for (let i = 1; i < overlap.prs.length; i++) {
      uf.union(overlap.prs[0], overlap.prs[i]);
    }
  }

  // Group PRs by cluster
  const groups = uf.groups();
  const prMap = new Map(prs.map((pr) => [pr.number, pr]));

  const independent: PR[] = [];
  const conflictGroups: ConflictGroup[] = [];

  for (const group of groups) {
    if (group.length === 1) {
      const pr = prMap.get(group[0]);
      if (pr) independent.push(pr);
    } else {
      const clusterPRSet = new Set(group);
      const sharedFiles = overlaps
        .filter((o) => o.prs.some((p) => clusterPRSet.has(p)))
        .map((o) => o.file);

      // Sort PRs within the cluster by ascending overlap score (fewest overlapping files first)
      const clusterPRs = group
        .map((num) => prMap.get(num)!)
        .filter(Boolean)
        .sort((a, b) => {
          const aOverlapCount = overlaps.filter((o) =>
            o.prs.includes(a.number),
          ).length;
          const bOverlapCount = overlaps.filter((o) =>
            o.prs.includes(b.number),
          ).length;
          return aOverlapCount - bOverlapCount || a.number - b.number;
        });

      conflictGroups.push({
        prs: clusterPRs,
        sharedFiles: [...new Set(sharedFiles)].sort(),
      });
    }
  }

  // Sort independent PRs by ascending file count, then PR number
  independent.sort((a, b) => {
    const aFiles = prFiles.get(a.number)?.length ?? 0;
    const bFiles = prFiles.get(b.number)?.length ?? 0;
    return aFiles - bFiles || a.number - b.number;
  });

  return { independent, conflictGroups };
}

// ── API Integration ─────────────────────────────────────────────────

/**
 * Fetch changed files for each PR via the GitHub API.
 * Returns a map of PR number → file paths.
 * Non-fatal: returns empty file list on API error.
 */
export async function fetchPRFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  prs: PR[],
): Promise<Map<number, string[]>> {
  const prFiles = new Map<number, string[]>();

  await Promise.all(
    prs.map(async (pr) => {
      try {
        const { data: files } = await octokit.rest.pulls.listFiles({
          owner,
          repo,
          pull_number: pr.number,
          per_page: 100,
        });
        prFiles.set(
          pr.number,
          files.map((f) => f.filename),
        );
      } catch {
        // Non-fatal — treat as no files (won't block merge)
        prFiles.set(pr.number, []);
      }
    }),
  );

  return prFiles;
}

/**
 * Plans the merge order by fetching file data and partitioning PRs.
 * This is the main entry point called by the merge handler.
 */
export async function planMergeOrder(
  octokit: Octokit,
  owner: string,
  repo: string,
  prs: PR[],
): Promise<MergePlan> {
  const prFiles = await fetchPRFiles(octokit, owner, repo, prs);
  return partitionPRs(prs, prFiles);
}
