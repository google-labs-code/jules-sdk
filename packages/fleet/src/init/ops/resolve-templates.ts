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
import type { InitInput, InitResult } from '../spec.js';
import type { WorkflowTemplate } from '../templates/types.js';
import { buildWorkflowTemplates } from '../templates.js';
import { FeatureReconcileHandler } from '../features/handler.js';
import { fail } from '../../shared/result/index.js';

/**
 * Resolve which workflow templates should be committed.
 *
 * - Without features: returns the default set from `buildWorkflowTemplates`.
 * - With features: delegates to `FeatureReconcileHandler` to compute the
 *   adds/removes, returning only the `toAdd` set.
 *
 * Returns templates on success, or a fail `InitResult` on error.
 */
export async function resolveTemplates(
  octokit: Octokit,
  input: InitInput,
): Promise<readonly WorkflowTemplate[] | InitResult> {
  let templates = buildWorkflowTemplates(input.intervalMinutes);

  if (input.features) {
    const { owner, repoName: repo } = input;
    const reconciler = new FeatureReconcileHandler(octokit);
    const featureResult = await reconciler.execute({
      owner,
      repo,
      desired: input.features as Record<string, boolean>,
    });

    if (!featureResult.success) {
      return fail(
        'UNKNOWN_ERROR',
        featureResult.error.message,
        featureResult.error.recoverable,
        featureResult.error.suggestion,
      );
    }
    templates = featureResult.data.toAdd;
  }

  return templates;
}
