import { z } from 'zod';
import type { GitPatch } from '@google/jules-sdk';

// 1. INPUT
export const AnalyzeGitPatchInputSchema = z.object({
  sourceRepo: z.string().describe('The GitHub repository in format owner/repo (e.g., davideast/dataprompt)'),
  limit: z.number().int().positive().default(10).describe('Number of recent activities to search for GitPatch data'),
});
export type AnalyzeGitPatchInput = z.infer<typeof AnalyzeGitPatchInputSchema>;

// 2. ERROR CODES
export const AnalyzeGitPatchErrorCode = z.enum([
  'NO_GITPATCH_FOUND',
  'SESSION_FAILED',
  'UNKNOWN_ERROR',
]);

// 3. RESULT
export const AnalyzeGitPatchSuccess = z.object({
  success: z.literal(true),
  data: z.object({
    analysis: z.string(),
    sourceSessionId: z.string(),
  }),
});

export const AnalyzeGitPatchFailure = z.object({
  success: z.literal(false),
  error: z.object({
    code: AnalyzeGitPatchErrorCode,
    message: z.string(),
    suggestion: z.string().optional(),
    recoverable: z.boolean(),
  }),
});

export type AnalyzeGitPatchResult =
  | z.infer<typeof AnalyzeGitPatchSuccess>
  | z.infer<typeof AnalyzeGitPatchFailure>;

// 4. INTERFACE
export interface AnalyzeGitPatchSpec {
  execute(input: AnalyzeGitPatchInput): Promise<AnalyzeGitPatchResult>;
}
