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
import type { FleetEmitter } from '../shared/events.js';
import { ok, fail } from '../shared/result/index.js';
import { FLEET_LABELS } from './labels.js';
import { detectSecretsFromEnv } from '../init/ops/detect-secrets.js';
import { uploadSecret } from '../init/ops/upload-secrets.js';

export interface ConfigureHandlerDeps {
  octokit: Octokit;
  emit?: FleetEmitter;
}

/**
 * ConfigureHandler manages repo resources (labels, etc.).
 * Never throws — all errors returned as Result.
 */
export class ConfigureHandler implements ConfigureSpec {
  private octokit: Octokit;
  private emit: FleetEmitter;

  constructor(deps: ConfigureHandlerDeps) {
    this.octokit = deps.octokit;
    this.emit = deps.emit ?? (() => { });
  }

  async execute(input: ConfigureInput): Promise<ConfigureResult> {
    try {
      this.emit({
        type: 'configure:start',
        resource: input.resource,
        owner: input.owner,
        repo: input.repo,
      });

      if (input.resource === 'labels') {
        const result = input.action === 'create'
          ? await this.createLabels(input.owner, input.repo)
          : await this.deleteLabels(input.owner, input.repo);

        this.emit({ type: 'configure:done' });
        return result;
      }

      if (input.resource === 'milestones') {
        if (!input.milestone) {
          return fail('UNKNOWN_ERROR', 'Milestone title is required', false);
        }
        const result = input.action === 'create'
          ? await this.createMilestones(input.owner, input.repo, input.milestone)
          : fail('UNKNOWN_ERROR', 'Deleting milestones is not supported', false);

        this.emit({ type: 'configure:done' });
        return result;
      }

      if (input.resource === 'secrets') {
        if (input.action === 'delete') {
          return fail('UNKNOWN_ERROR', 'Deleting secrets is not supported. Remove them manually in GitHub Settings → Secrets.', false);
        }
        const result = await this.createSecrets(input.owner, input.repo);
        this.emit({ type: 'configure:done' });
        return result;
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
        this.emit({ type: 'configure:label:created', name: label.name });
      } catch (error: unknown) {
        const status =
          error && typeof error === 'object' && 'status' in error
            ? (error as { status: number }).status
            : 0;
        if (status === 422) {
          // Already exists
          skipped.push(label.name);
          this.emit({ type: 'configure:label:exists', name: label.name });
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
        this.emit({ type: 'configure:label:created', name: label.name });
      } catch (error: unknown) {
        const status =
          error && typeof error === 'object' && 'status' in error
            ? (error as { status: number }).status
            : 0;
        if (status === 404) {
          skipped.push(label.name);
          this.emit({ type: 'configure:label:exists', name: label.name });
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

  private async createMilestones(
    owner: string,
    repo: string,
    title: string,
  ): Promise<ConfigureResult> {
    try {
      await this.octokit.rest.issues.createMilestone({
        owner,
        repo,
        title,
      });
      this.emit({ type: 'configure:milestone:created', name: title });
      return ok({ created: [title], deleted: [], skipped: [] });
    } catch (error: unknown) {
      const status =
        error && typeof error === 'object' && 'status' in error
          ? (error as { status: number }).status
          : 0;
      if (status === 422) {
        // Already exists
        this.emit({ type: 'configure:milestone:exists', name: title });
        return ok({ created: [], deleted: [], skipped: [title] });
      } else {
        return fail(
          'GITHUB_API_ERROR',
          `Failed to create milestone "${title}": ${error instanceof Error ? error.message : error}`,
          true,
        );
      }
    }
  }
  private async createSecrets(
    owner: string,
    repo: string,
  ): Promise<ConfigureResult> {
    const secrets = detectSecretsFromEnv();
    const secretNames = Object.keys(secrets);

    if (secretNames.length === 0) {
      return fail(
        'UNKNOWN_ERROR',
        'No secrets found in environment. Set JULES_API_KEY, FLEET_APP_ID, FLEET_APP_PRIVATE_KEY, or FLEET_APP_INSTALLATION_ID.',
        true,
        'Set the environment variables and retry.',
      );
    }

    const created: string[] = [];
    const skipped: string[] = [];

    for (const name of secretNames) {
      const uploadResult = await uploadSecret(
        this.octokit,
        owner,
        repo,
        name,
        secrets[name],
        this.emit,
      );
      if (uploadResult.success) {
        created.push(name);
      } else {
        skipped.push(name);
      }
    }

    return ok({ created, deleted: [], skipped });
  }
}
