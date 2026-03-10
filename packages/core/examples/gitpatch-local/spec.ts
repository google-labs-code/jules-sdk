import { z } from 'zod';

export const ApplyPatchInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID cannot be empty'),
  targetBranch: z.string().optional(),
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

export type ApplyPatchResult =
  | z.infer<typeof ApplyPatchSuccess>
  | z.infer<typeof ApplyPatchFailure>;

export interface ApplyPatchSpec {
  execute(input: ApplyPatchInput): Promise<ApplyPatchResult>;
}
