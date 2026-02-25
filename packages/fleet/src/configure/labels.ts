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

import type { Label } from '../shared/schemas/label.js';

/**
 * Fleet label definitions.
 * These are the labels that fleet commands expect to exist in the repo.
 */
export const FLEET_LABELS: readonly Label[] = [
  {
    name: 'fleet-merge-ready',
    color: '0e8a16',
    description: 'Ready for fleet sequential merge',
  },
  {
    name: 'fleet',
    color: '1d76db',
    description: 'Fleet-managed issue',
  },
] as const;
