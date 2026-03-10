import { z } from 'zod';

// 1. INPUT (The Command) - "Parse, don't validate"
export const ReviewInputSchema = z.object({
  repository: z.string().min(1, 'Repository must be provided (e.g., owner/repo)'),
  baseBranch: z.string().min(1, 'Base branch must be provided (e.g., main)'),
  prompt: z.string().min(1, 'A prompt to generate code must be provided'),
  json: z.boolean().default(false),
});

export type ReviewInput = z.infer<typeof ReviewInputSchema>;

// 2. ERROR CODES (Exhaustive)
export const ReviewErrorCode = z.enum([
  'SESSION_FAILED',
  'NO_CHANGES_GENERATED',
  'UNKNOWN_ERROR',
  'UNAUTHORIZED',
]);

// 3. RESULT (The Monad)
export const ReviewSuccess = z.object({
  success: z.literal(true),
  data: z.object({
    reviewMessage: z.string(),
    codeGenSessionId: z.string(),
    reviewSessionId: z.string(),
    gitPatchStr: z.string(),
  }),
});

export const ReviewFailure = z.object({
  success: z.literal(false),
  error: z.object({
    code: ReviewErrorCode,
    message: z.string(),
    suggestion: z.string().optional(),
    recoverable: z.boolean(),
  }),
});

export type ReviewResult = z.infer<typeof ReviewSuccess> | z.infer<typeof ReviewFailure>;

// 4. INTERFACE (The Capability)
export interface ReviewSpec {
  execute(input: ReviewInput): Promise<ReviewResult>;
}
