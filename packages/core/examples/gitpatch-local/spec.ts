import { z } from 'zod';

// 1. VALIDATION HELPERS (Input Hardening against hallucinations)
export const SafeStringSchema = z.string()
  .min(1, 'Cannot be empty')
  .refine(s => !/[\x00-\x1F\x7F]/.test(s), "No control characters allowed")
  .refine(s => !s.includes('..'), "No path traversal allowed")
  .refine(s => !s.includes('?') && !s.includes('#'), "No query or hash parameters allowed");

export const ApplyPatchInputSchema = z.object({
  sessionId: SafeStringSchema,
  targetBranch: SafeStringSchema.optional(),
  dryRun: z.boolean().default(false),
});
export type ApplyPatchInput = z.infer<typeof ApplyPatchInputSchema>;

export const ApplyPatchErrorCode = z.enum([
  'SESSION_NOT_FOUND',
  'NO_CHANGESET_FOUND',
  'UNABLE_TO_CHECKOUT_BRANCH',
  'UNABLE_TO_APPLY_PATCH',
  'UNABLE_TO_COMMIT',
  'UNKNOWN_ERROR',
]);

export const ApplyPatchSuccess = z.object({
  success: z.literal(true),
  data: z.object({
    branchName: z.string(),
    commitMessage: z.string().optional(),
  }),
});

export const ApplyPatchFailure = z.object({
  success: z.literal(false),
  error: z.object({
    code: ApplyPatchErrorCode,
    message: z.string(),
    recoverable: z.boolean(),
  }),
});

export const ApplyPatchResultSchema = z.discriminatedUnion('success', [
  ApplyPatchSuccess,
  ApplyPatchFailure,
]);

export type ApplyPatchResult = z.infer<typeof ApplyPatchResultSchema>;

export interface ApplyPatchSpec {
  execute(input: ApplyPatchInput): Promise<ApplyPatchResult>;
}
