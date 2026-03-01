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
  FeatureReconcileSpec,
  FeatureReconcileInput,
  FeatureReconcileResult,
  FeatureKey,
} from './spec.js';
import { FEATURE_KEYS } from './spec.js';
import { FEATURE_REGISTRY } from './registry.js';
import { ok, fail } from '../../shared/result/index.js';

export class FeatureReconcileHandler implements FeatureReconcileSpec {
  constructor(private octokit: Octokit) {}

  async execute(input: FeatureReconcileInput): Promise<FeatureReconcileResult> {
    try {
      // 1. Detect installed workflows
      let installedPaths: Set<string>;
      try {
        installedPaths = await this.detectInstalledWorkflows(
          input.owner,
          input.repo,
        );
      } catch (error: any) {
        if (error?.status === 403) {
          return fail(
            'GITHUB_API_ERROR',
            `Rate limit exceeded while detecting workflows: ${error.message}`,
            true,
            'Wait and retry, or check GITHUB_TOKEN scopes.',
          );
        }
        return fail(
          'DETECTION_FAILED',
          `Failed to detect installed workflows: ${error instanceof Error ? error.message : String(error)}`,
          true,
          'Check repository access and GITHUB_TOKEN permissions.',
        );
      }

      // 2. Reconcile desired vs installed
      const toAdd = [];
      const toRemove = [];
      const unchanged = [];

      for (const key of FEATURE_KEYS) {
        const template = FEATURE_REGISTRY[key as FeatureKey];
        const isInstalled = installedPaths.has(template.repoPath);
        const isDesired = input.desired[key as FeatureKey] ?? true;

        if (isDesired && !isInstalled) {
          toAdd.push(template);
        } else if (!isDesired && isInstalled) {
          toRemove.push(template.repoPath);
        } else {
          unchanged.push(template.repoPath);
        }
      }

      return ok({ toAdd, toRemove, unchanged });
    } catch (error: any) {
      return fail(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }
  }

  /**
   * List files in .github/workflows/ and return a Set of their paths.
   * Returns an empty set if the directory doesn't exist (404).
   */
  private async detectInstalledWorkflows(
    owner: string,
    repo: string,
  ): Promise<Set<string>> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: '.github/workflows',
      });

      if (!Array.isArray(data)) {
        return new Set();
      }

      return new Set(data.map((f) => f.path));
    } catch (error: any) {
      // 404 means no workflows directory — not an error
      if (error?.status === 404) {
        return new Set();
      }
      throw error;
    }
  }
}
