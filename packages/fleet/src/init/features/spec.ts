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

import { z } from 'zod';
import type { WorkflowTemplate } from '../templates/types.js';

// ── FEATURE KEY ─────────────────────────────────────────────────────

export const FeatureKeySchema = z.enum([
  'analyze',
  'dispatch',
  'merge',
  'conflict-detection',
]);
export type FeatureKey = z.infer<typeof FeatureKeySchema>;

export const FEATURE_KEYS = FeatureKeySchema.options;

// ── INPUT ───────────────────────────────────────────────────────────

export const FeatureReconcileInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  desired: z.record(FeatureKeySchema, z.boolean()).default({
    'analyze': true,
    'dispatch': true,
    'merge': true,
    'conflict-detection': true,
  }),
});
export type FeatureReconcileInput = z.infer<typeof FeatureReconcileInputSchema>;

// ── ERROR CODES (exhaustive) ────────────────────────────────────────

export const FeatureReconcileErrorCode = z.enum([
  'DETECTION_FAILED',
  'GITHUB_API_ERROR',
  'UNKNOWN_ERROR',
]);
export type FeatureReconcileErrorCode = z.infer<typeof FeatureReconcileErrorCode>;

// ── RESULT ──────────────────────────────────────────────────────────

export interface FeatureReconcileData {
  toAdd: WorkflowTemplate[];
  toRemove: string[];
  unchanged: string[];
}

export interface FeatureReconcileSuccess {
  success: true;
  data: FeatureReconcileData;
}

export interface FeatureReconcileFailure {
  success: false;
  error: {
    code: FeatureReconcileErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}

export type FeatureReconcileResult =
  | FeatureReconcileSuccess
  | FeatureReconcileFailure;

// ── INTERFACE ───────────────────────────────────────────────────────

export interface FeatureReconcileSpec {
  execute(input: FeatureReconcileInput): Promise<FeatureReconcileResult>;
}
