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

// ── INPUT ───────────────────────────────────────────────────────────

export const ConfigureAction = z.enum(['create', 'delete']);
export type ConfigureAction = z.infer<typeof ConfigureAction>;

export const ConfigureResource = z.enum(['labels']);
export type ConfigureResource = z.infer<typeof ConfigureResource>;

export const ConfigureInputSchema = z.object({
  /** Resource to configure */
  resource: ConfigureResource,
  /** Create or delete the resource */
  action: ConfigureAction.default('create'),
  /** Repository owner */
  owner: z.string().min(1),
  /** Repository name */
  repo: z.string().min(1),
});

export type ConfigureInput = z.infer<typeof ConfigureInputSchema>;

// ── ERROR CODES ─────────────────────────────────────────────────────

export const ConfigureErrorCode = z.enum([
  'GITHUB_API_ERROR',
  'UNKNOWN_ERROR',
]);
export type ConfigureErrorCode = z.infer<typeof ConfigureErrorCode>;

// ── RESULT ──────────────────────────────────────────────────────────

export interface ConfigureSuccess {
  success: true;
  data: {
    created: string[];
    deleted: string[];
    skipped: string[];
  };
}

export interface ConfigureFailure {
  success: false;
  error: {
    code: ConfigureErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}

export type ConfigureResult = ConfigureSuccess | ConfigureFailure;

// ── INTERFACE ───────────────────────────────────────────────────────

export interface ConfigureSpec {
  execute(input: ConfigureInput): Promise<ConfigureResult>;
}
