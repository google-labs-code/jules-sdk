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
  ConfigureInput,
  ConfigureResult,
  ConfigureSpec,
} from './spec.js';
import { ok, fail } from '../shared/result/index.js';
import { FLEET_LABELS } from './labels.js';

/**
 * ConfigureHandler manages repo resources (labels, etc.).
 * Never throws — all errors returned as Result.
 */
export class ConfigureHandler implements ConfigureSpec {
  constructor(
    private octokit: Octokit,
    private log: (msg: string) => void = console.log,
  ) { }

  async execute(input: ConfigureInput): Promise<ConfigureResult> {
    try {
      if (input.resource === 'labels') {
        return input.action === 'create'
          ? this.createLabels(input.owner, input.repo)
          : this.deleteLabels(input.owner, input.repo);
      }

      return fail(
        'UNKNOWN_ERROR',
        `Unknown resource: ${input.resource}`,
        false,
      );
    } catch (error) {
      return fail(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        false,
      );
    }
  }

  private async createLabels(
    owner: string,
    repo: string,
  ): Promise<ConfigureResult> {
    const created: string[] = [];
    const skipped: string[] = [];

    for (const label of FLEET_LABELS) {
      try {
        await this.octokit.rest.issues.createLabel({
          owner,
          repo,
          name: label.name,
          color: label.color,
          description: label.description,
        });
        created.push(label.name);
        this.log(`  ✅ Created label: ${label.name}`);
      } catch (error: unknown) {
        const status =
          error && typeof error === 'object' && 'status' in error
            ? (error as { status: number }).status
            : 0;
        if (status === 422) {
          // Already exists
          skipped.push(label.name);
          this.log(`  ⏭️  Label already exists: ${label.name}`);
        } else {
          return fail(
            'GITHUB_API_ERROR',
            `Failed to create label "${label.name}": ${error instanceof Error ? error.message : error}`,
            true,
          );
        }
      }
    }

    return ok({ created, deleted: [], skipped });
  }

  private async deleteLabels(
    owner: string,
    repo: string,
  ): Promise<ConfigureResult> {
    const deleted: string[] = [];
    const skipped: string[] = [];

    for (const label of FLEET_LABELS) {
      try {
        await this.octokit.rest.issues.deleteLabel({
          owner,
          repo,
          name: label.name,
        });
        deleted.push(label.name);
        this.log(`  🗑️  Deleted label: ${label.name}`);
      } catch (error: unknown) {
        const status =
          error && typeof error === 'object' && 'status' in error
            ? (error as { status: number }).status
            : 0;
        if (status === 404) {
          skipped.push(label.name);
          this.log(`  ⏭️  Label not found: ${label.name}`);
        } else {
          return fail(
            'GITHUB_API_ERROR',
            `Failed to delete label "${label.name}": ${error instanceof Error ? error.message : error}`,
            true,
          );
        }
      }
    }

    return ok({ created: [], deleted, skipped });
  }
}
