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
export { FLEET_ANALYZE_TEMPLATE } from './templates/analyze.js';
export { FLEET_DISPATCH_TEMPLATE } from './templates/dispatch.js';
export { FLEET_MERGE_TEMPLATE } from './templates/merge.js';

import { FLEET_ANALYZE_TEMPLATE } from './templates/analyze.js';
import { FLEET_DISPATCH_TEMPLATE } from './templates/dispatch.js';
import { FLEET_MERGE_TEMPLATE } from './templates/merge.js';
import type { WorkflowTemplate } from './templates/types.js';

export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  FLEET_ANALYZE_TEMPLATE,
  FLEET_DISPATCH_TEMPLATE,
  FLEET_MERGE_TEMPLATE,
];
