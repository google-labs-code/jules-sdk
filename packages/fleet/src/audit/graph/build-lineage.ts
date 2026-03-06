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
import type {
  NodeRef,
  GraphNode,
  GraphEdge,
  LineageGraph,
  UnresolvedEdge,
} from './types.js';
import { nodeKey } from './types.js';
import { resolvePRToIssues } from '../ops/resolve-pr-to-issues.js';
import { resolveIssueToPRs } from '../ops/resolve-issue-to-prs.js';
import { resolveIssueToSession } from '../ops/resolve-issue-to-session.js';
import { resolvePRToSession } from '../ops/resolve-pr-to-session.js';
import { resolvePRToChecks } from '../ops/resolve-pr-to-checks.js';
import { resolveMilestoneToItems } from '../ops/resolve-milestone-to-items.js';

export interface BuildLineageDeps {
  octokit: Octokit;
}

export interface BuildLineageOptions {
  /** Max traversal depth (default: 2) */
  depth?: number;
}

/**
 * Build a lineage graph via BFS from a starting node.
 *
 * Walks outward from the start node, resolving edges at each step.
 * Respects `depth` for lazy loading to prevent exponential blowup.
 */
export async function buildLineage(
  deps: BuildLineageDeps,
  owner: string,
  repo: string,
  startNode: NodeRef,
  options?: BuildLineageOptions,
): Promise<LineageGraph> {
  const maxDepth = options?.depth ?? 2;
  const { octokit } = deps;

  const graph: LineageGraph = {
    nodes: new Map(),
    root: startNode,
    unresolvedEdges: [],
  };

  // BFS queue: [nodeRef, currentDepth]
  const queue: [NodeRef, number][] = [[startNode, 0]];

  while (queue.length > 0) {
    const [ref, depth] = queue.shift()!;
    const key = nodeKey(ref);

    // Skip already-visited nodes
    if (graph.nodes.has(key)) continue;

    // Fetch node data and resolve edges
    const { node, unresolvedEdges } = await resolveNode(
      octokit,
      owner,
      repo,
      ref,
    );

    graph.nodes.set(key, node);
    graph.unresolvedEdges.push(...unresolvedEdges);

    // Queue neighbors if within depth
    if (depth < maxDepth) {
      for (const edge of node.edges) {
        if (edge.resolved && !graph.nodes.has(nodeKey(edge.target))) {
          queue.push([edge.target, depth + 1]);
        }
      }
    }
  }

  return graph;
}

/**
 * Fetch node data and resolve its outgoing edges.
 * Returns the node + any unresolved edges discovered.
 */
async function resolveNode(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: NodeRef,
): Promise<{ node: GraphNode; unresolvedEdges: UnresolvedEdge[] }> {
  const edges: GraphEdge[] = [];
  const unresolvedEdges: UnresolvedEdge[] = [];
  let data: Record<string, unknown> = {};

  switch (ref.kind) {
    case 'issue': {
      const { data: issue } = await octokit.rest.issues.get({
        owner,
        repo,
        issue_number: Number(ref.id),
      });
      data = { number: issue.number, title: issue.title, state: issue.state, labels: issue.labels, body: issue.body, milestone: issue.milestone };

      // Issue → PRs (via timeline)
      const prRefs = await resolveIssueToPRs(octokit, owner, repo, Number(ref.id));
      for (const pr of prRefs) {
        edges.push({ relation: 'fixes', target: pr, resolved: true });
      }

      // Issue → Session (via Fleet Context footer)
      const sessionRef = resolveIssueToSession(issue.body ?? '');
      if (sessionRef) {
        edges.push({ relation: 'dispatched', target: sessionRef, resolved: true });
      } else {
        // Check if this is a fleet issue that SHOULD have a source
        const isFleetIssue = issue.labels?.some(
          (l: any) => (typeof l === 'string' ? l : l.name)?.startsWith('fleet'),
        );
        if (isFleetIssue) {
          unresolvedEdges.push({
            from: ref,
            expectedRelation: 'dispatched',
            reason: 'No Fleet Context footer in issue body',
          });
        }
      }

      // Issue → Milestone
      if (issue.milestone) {
        edges.push({
          relation: 'belongs-to',
          target: { kind: 'milestone', id: String(issue.milestone.number) },
          resolved: true,
        });
      }
      break;
    }

    case 'pr': {
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: Number(ref.id),
      });
      data = { number: pr.number, title: pr.title, state: pr.state, labels: pr.labels, headRef: pr.head.ref, headSha: pr.head.sha, merged: pr.merged, body: pr.body, milestone: pr.milestone };

      // PR → Issues (via closingIssuesReferences)
      const issueRefs = await resolvePRToIssues(octokit, owner, repo, Number(ref.id));
      for (const issue of issueRefs) {
        edges.push({ relation: 'fixes', target: issue, resolved: true });
      }

      // PR → Session (from body/branch)
      const sessionRef = resolvePRToSession(pr.body ?? '', pr.head.ref);
      if (sessionRef) {
        edges.push({ relation: 'produced', target: sessionRef, resolved: true });
      } else if (pr.head.ref.startsWith('jules/')) {
        // Jules PR but can't find session — unresolved
        unresolvedEdges.push({
          from: ref,
          expectedRelation: 'produced',
          reason: 'PR on jules/ branch but no session ID found in body or branch name',
        });
      }

      // PR → Checks
      const checkRefs = await resolvePRToChecks(octokit, owner, repo, pr.head.sha);
      for (const check of checkRefs) {
        edges.push({ relation: 'has-check', target: check, resolved: true });
      }

      // PR → Milestone
      if (pr.milestone) {
        edges.push({
          relation: 'belongs-to',
          target: { kind: 'milestone', id: String(pr.milestone.number) },
          resolved: true,
        });
      }
      break;
    }

    case 'milestone': {
      const { data: milestone } = await octokit.rest.issues.getMilestone({
        owner,
        repo,
        milestone_number: Number(ref.id),
      });
      data = { number: milestone.number, title: milestone.title, state: milestone.state };

      // Milestone → Items
      const itemRefs = await resolveMilestoneToItems(octokit, owner, repo, Number(ref.id));
      for (const item of itemRefs) {
        edges.push({ relation: 'belongs-to', target: item, resolved: true });
      }
      break;
    }

    case 'session': {
      // Session nodes are resolved but we can't fetch their data
      // without a Jules client. Store minimal data for now.
      data = { sessionId: ref.id };
      break;
    }

    case 'check-run': {
      // Check runs are leaf nodes — no outgoing edges
      data = { checkRunId: ref.id };
      break;
    }

    default: {
      data = { id: ref.id };
    }
  }

  return {
    node: { ref, data, edges },
    unresolvedEdges,
  };
}
