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

/**
 * Barrel re-export for workflow templates.
 * Each template lives in its own file to prevent merge conflicts.
 */

export type { WorkflowTemplate } from './templates/types.js';
export { buildAnalyzeTemplate, FLEET_ANALYZE_TEMPLATE } from './templates/analyze.js';
export { buildDispatchTemplate, FLEET_DISPATCH_TEMPLATE } from './templates/dispatch.js';
export { buildMergeTemplate, FLEET_MERGE_TEMPLATE } from './templates/merge.js';
export { CONFLICT_DETECTION_TEMPLATE } from './templates/conflict-detection.js';
export { FLEET_LABEL_TEMPLATE } from './templates/label.js';
export { buildCron, mergeInterval, dispatchOffset } from './templates/cron.js';

import { buildAnalyzeTemplate } from './templates/analyze.js';
import { buildDispatchTemplate } from './templates/dispatch.js';
import { buildMergeTemplate } from './templates/merge.js';
import { CONFLICT_DETECTION_TEMPLATE } from './templates/conflict-detection.js';
import { FLEET_LABEL_TEMPLATE } from './templates/label.js';
import type { WorkflowTemplate } from './templates/types.js';

/**
 * Build all workflow templates with a configurable interval.
 * @param intervalMinutes - Pipeline cadence in minutes (default: 360 = 6 hours)
 * @param auth - Authentication mode: 'token' uses secrets.GITHUB_TOKEN,
 *               'app' generates a GitHub App token for CLA-safe commits
 */
export function buildWorkflowTemplates(
  intervalMinutes = 360,
  auth: 'token' | 'app' = 'token',
): readonly WorkflowTemplate[] {
  return [
    buildAnalyzeTemplate(intervalMinutes, auth),
    buildDispatchTemplate(intervalMinutes, auth),
    buildMergeTemplate(intervalMinutes, auth),
    CONFLICT_DETECTION_TEMPLATE,
    FLEET_LABEL_TEMPLATE,
  ];
}

/** Default templates at 6-hour interval */
export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = buildWorkflowTemplates(360);
