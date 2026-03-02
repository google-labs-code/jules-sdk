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

import type { InitArgs } from './types.js';
import type { FeatureKey } from '../features/spec.js';

/**
 * Maps CLI flag names to feature registry keys.
 * CLI uses user-friendly names; registry uses internal keys.
 */
const FLAG_TO_KEY: Record<string, FeatureKey> = {
  'analyze': 'analyze',
  'dispatch': 'dispatch',
  'auto-merge': 'merge',
  'conflict-detection': 'conflict-detection',
};

/**
 * Parses per-feature CLI flags into a features record for FeatureReconcileHandler.
 *
 * Convention:
 * - Flag present with no value or empty string → enable (true)
 * - Flag with value 'disable' → disable (false)
 * - Flag absent (undefined) → no change (omitted from record)
 *
 * Returns undefined if no feature flags were provided (use default behavior).
 */
export function parseFeatureFlags(args: InitArgs): Record<string, boolean> | undefined {
  const features: Record<string, boolean> = {};
  let hasAny = false;

  for (const [flag, key] of Object.entries(FLAG_TO_KEY)) {
    const value = args[flag as keyof InitArgs] as string | undefined;
    if (value !== undefined) {
      hasAny = true;
      features[key] = value !== 'disable';
    }
  }

  return hasAny ? features : undefined;
}
