import { z } from 'zod';

// 1. INPUT (The Command)
export const RunSessionInputSchema = z.object({
  spreadsheetId: z.string().min(1, 'Spreadsheet ID is required'),
  range: z.string().min(1, 'Range is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  json: z.boolean().default(false).optional(),
});
export type RunSessionInput = z.infer<typeof RunSessionInputSchema>;

// 2. ERROR CODES
export const RunSessionErrorCode = z.enum([
  'MISSING_CREDENTIALS',
  'SHEET_NOT_FOUND_OR_EMPTY',
  'API_ERROR',
  'JULES_ERROR',
  'UNKNOWN_ERROR'
]);

// 3. RESULT
export const RunSessionSuccess = z.object({
  success: z.literal(true),
  data: z.object({
    sessionId: z.string(),
    state: z.string(),
    agentMessage: z.string().optional(),
    files: z.record(z.string(), z.string()).optional(),
  }),
});

export const RunSessionFailure = z.object({
  success: z.literal(false),
  error: z.object({
    code: RunSessionErrorCode,
    message: z.string(),
    recoverable: z.boolean(),
  })
});

export type RunSessionResult =
  | z.infer<typeof RunSessionSuccess>
  | z.infer<typeof RunSessionFailure>;

// 4. INTERFACE
export interface RunSessionSpec {
  execute(input: RunSessionInput): Promise<RunSessionResult>;
}
