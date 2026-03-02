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

// ── INPUT ──

export const AuthDetectInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  /** If set, only check credentials for that method — never eagerly pick the other */
  preferredMethod: z.enum(['token', 'app']).optional(),
});
export type AuthDetectInput = z.infer<typeof AuthDetectInputSchema>;

// ── ERROR CODES ──

export const AuthDetectErrorCode = z.enum([
  'NO_CREDENTIALS_FOUND',
  'HEALTH_CHECK_FAILED',
  'UNKNOWN_ERROR',
]);
export type AuthDetectErrorCode = z.infer<typeof AuthDetectErrorCode>;

// ── RESULT ──

export type AuthSource = 'env' | 'gh-cli' | 'manual';

export interface DetectedCredential {
  method: 'token' | 'app';
  source: AuthSource;
}

export interface AuthDetectSuccess {
  success: true;
  data: {
    method: 'token' | 'app';
    source: AuthSource;
    identity: string;
    /** When both methods are detected and no preference — let wizard ask */
    alternatives?: DetectedCredential[];
  };
}

export interface AuthDetectFailure {
  success: false;
  error: {
    code: AuthDetectErrorCode;
    message: string;
    suggestion?: string;
    recoverable: boolean;
    /** Structured details for LLM analysis */
    details?: {
      httpStatus?: number;
      scopes?: string[];
      repoAccess?: boolean;
    };
  };
}

export type AuthDetectResult = AuthDetectSuccess | AuthDetectFailure;

// ── INTERFACE ──

export interface AuthDetectSpec {
  execute(input: AuthDetectInput): Promise<AuthDetectResult>;
}
