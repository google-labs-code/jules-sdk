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
import { fail } from '../../shared/result/index.js';
import type { InitResult } from '../spec.js';
import type { FleetEmitter } from '../../shared/events.js';

export interface CreateRepoOptions {
  visibility: 'public' | 'private';
  description?: string;
}

export interface CreateRepoData {
  fullName: string;
  url: string;
  cloneUrl: string;
}

/**
 * Create a GitHub repository. Detects whether the owner is an org or user
 * and calls the appropriate API endpoint.
 *
 * Returns repo data on success, or a fail Result on error.
 */
export async function createRepo(
  octokit: Octokit,
  owner: string,
  name: string,
  options: CreateRepoOptions,
  emit: FleetEmitter,
): Promise<CreateRepoData | InitResult> {
  emit({ type: 'init:repo:creating', owner, name });

  try {
    // Detect org vs user
    const { data: user } = await (octokit as any).rest.users.getByUsername({ username: owner });
    const isOrg = user.type === 'Organization';

    let data: any;
    if (isOrg) {
      const response = await octokit.rest.repos.createInOrg({
        org: owner,
        name,
        visibility: options.visibility,
        description: options.description,
      });
      data = response.data;
    } else {
      const response = await octokit.rest.repos.createForAuthenticatedUser({
        name,
        private: options.visibility === 'private',
        description: options.description,
      });
      data = response.data;
    }

    const result: CreateRepoData = {
      fullName: data.full_name,
      url: data.html_url,
      cloneUrl: data.clone_url,
    };

    emit({ type: 'init:repo:created', fullName: result.fullName, url: result.url });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit({ type: 'init:repo:failed', reason: message });
    return fail(
      'REPO_CREATE_FAILED',
      `Failed to create repo "${owner}/${name}": ${message}`,
      true,
    );
  }
}

/** Type guard: returns true if the result is a fail Result (not repo data) */
export function isRepoResult(
  result: CreateRepoData | InitResult,
): result is InitResult {
  return 'success' in result;
}
