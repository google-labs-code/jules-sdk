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

import type { WorkflowTemplate } from '../templates/types.js';
import type { FeatureKey } from './spec.js';
import { FLEET_ANALYZE_TEMPLATE } from '../templates/analyze.js';
import { FLEET_DISPATCH_TEMPLATE } from '../templates/dispatch.js';
import { FLEET_MERGE_TEMPLATE } from '../templates/merge.js';
import { CONFLICT_DETECTION_TEMPLATE } from '../templates/conflict-detection.js';

/**
 * Maps each FeatureKey to its corresponding WorkflowTemplate.
 * Pure data — no logic. Adding a feature means adding one entry here
 * and one value to FeatureKeySchema in spec.ts.
 */
export const FEATURE_REGISTRY: Record<FeatureKey, WorkflowTemplate> = {
  'analyze': FLEET_ANALYZE_TEMPLATE,
  'dispatch': FLEET_DISPATCH_TEMPLATE,
  'merge': FLEET_MERGE_TEMPLATE,
  'conflict-detection': CONFLICT_DETECTION_TEMPLATE,
};
