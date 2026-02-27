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
export const InitInputSchema = z.object({
  outputDir: z.string().min(1).default('.'),
  workflowName: z.string().min(1).default('jules-merge-check'),
  baseBranch: z.string().min(1).default('main'),
  force: z.boolean().default(false),
});
export type InitInput = z.infer<typeof InitInputSchema>;

// ERROR CODES (exhaustive)
export const InitErrorCode = z.enum([
  'DIRECTORY_NOT_FOUND',
  'FILE_ALREADY_EXISTS',
  'WRITE_FAILED',
  'UNKNOWN_ERROR',
]);
export type InitErrorCode = z.infer<typeof InitErrorCode>;

// SUCCESS DATA
export interface InitData {
  filePath: string;
  content: string;
}

// RESULT (Discriminated Union)
export interface InitSuccess {
  success: true;
  data: InitData;
}
export interface InitFailure {
  success: false;
  error: {
    code: InitErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}
export type InitResult = InitSuccess | InitFailure;

// INTERFACE (Capability)
export interface InitSpec {
  execute(input: InitInput): Promise<InitResult>;
}
