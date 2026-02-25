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

/**
 * Creates typed Success and Failure Zod schemas for the Result pattern.
 * Handlers return `Result` instead of throwing — errors are values.
 */
export function createResultSchemas<
  TData extends z.ZodType,
  TCode extends z.ZodEnum<[string, ...string[]]>,
>(dataSchema: TData, errorCodeSchema: TCode) {
  const Success = z.object({
    success: z.literal(true),
    data: dataSchema,
  });

  const Failure = z.object({
    success: z.literal(false),
    error: z.object({
      code: errorCodeSchema,
      message: z.string(),
      suggestion: z.string().optional(),
      recoverable: z.boolean(),
    }),
  });

  return { Success, Failure };
}
