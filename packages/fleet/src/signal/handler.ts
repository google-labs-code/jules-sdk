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
  SignalCreateSpec,
  SignalCreateInput,
  SignalCreateResult,
} from './spec.js';

/**
 * Signal creation handler — GitHub adapter.
 *
 * Maps fleet domain concepts to GitHub Issues:
 * - signal.kind → label (fleet-insight or fleet-assessment)
 * - signal.tags → labels
 * - signal.scope → milestone (resolved by title)
 */
export class SignalCreateHandler implements SignalCreateSpec {
  constructor(private readonly deps: { octokit: InstanceType<typeof Octokit> }) {}

  async execute(input: SignalCreateInput): Promise<SignalCreateResult> {
    try {
      const { octokit } = this.deps;

      // Map kind to label
      const labels = [...input.tags];
      labels.push(
        input.kind === 'insight' ? 'fleet-insight' : 'fleet-assessment',
      );

      // Resolve scope name to milestone ID if provided
      let milestoneNumber: number | undefined;
      if (input.scope) {
        const { data: milestones } = await octokit.rest.issues.listMilestones({
          owner: input.owner,
          repo: input.repo,
          state: 'open',
        });
        const match = milestones.find(
          (m) => m.title.toLowerCase() === input.scope!.toLowerCase(),
        );
        if (!match) {
          return {
            success: false,
            error: {
              code: 'SCOPE_NOT_FOUND',
              message: `No open milestone found matching scope "${input.scope}"`,
              recoverable: true,
              suggestion: `Create a milestone named "${input.scope}" or omit --scope`,
            },
          };
        }
        milestoneNumber = match.number;
      }

      // Create the GitHub issue
      const { data } = await octokit.rest.issues.create({
        owner: input.owner,
        repo: input.repo,
        title: input.title,
        body: input.body,
        labels,
        ...(milestoneNumber && { milestone: milestoneNumber }),
      });

      return {
        success: true,
        data: { id: data.number, url: data.html_url },
      };
    } catch (error) {
      // GitHub API errors (auth, rate limit, permissions, etc.)
      if (error instanceof Error && 'status' in error) {
        return {
          success: false,
          error: {
            code: 'GITHUB_API_ERROR',
            message: error.message,
            recoverable: (error as any).status === 403 || (error as any).status === 429,
            suggestion: (error as any).status === 401
              ? 'Check your GITHUB_TOKEN or GitHub App credentials'
              : undefined,
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
        },
      };
    }
  }
}
