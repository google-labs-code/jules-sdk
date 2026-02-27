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

// INPUT — "Parse, don't validate"
export const SessionCheckInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  repo: z
    .string()
    .min(1)
    .refine((s) => s.includes('/'), 'Must be in owner/repo format'),
  base: z.string().default('main'),
});
export type SessionCheckInput = z.infer<typeof SessionCheckInputSchema>;

// ERROR CODES (exhaustive)
export const SessionCheckErrorCode = z.enum([
  'SESSION_QUERY_FAILED',
  'GITHUB_API_ERROR',
  'RATE_LIMIT_EXCEEDED',
  'UNKNOWN_ERROR',
]);
export type SessionCheckErrorCode = z.infer<typeof SessionCheckErrorCode>;

// SUCCESS DATA
export interface SessionCheckData {
  status: 'clean' | 'conflict';
  message: string;
  conflicts: Array<{
    filePath: string;
    conflictReason: string;
    remoteShadowContent: string;
  }>;
}

// RESULT (Discriminated Union)
export interface SessionCheckSuccess {
  success: true;
  data: SessionCheckData;
}
export interface SessionCheckFailure {
  success: false;
  error: {
    code: SessionCheckErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}
export type SessionCheckResult = SessionCheckSuccess | SessionCheckFailure;

// INTERFACE (Capability)
export interface SessionCheckSpec {
  execute(input: SessionCheckInput): Promise<SessionCheckResult>;
}
