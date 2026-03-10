import { z } from 'zod';

export const ReviewInputSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  dryRun: z.boolean().default(false).describe('Simulates the command without making API calls.'),
});

export type ReviewInput = z.infer<typeof ReviewInputSchema>;

export const ReviewErrorCode = z.enum([
  'GENERATION_FAILED',
  'REVIEW_FAILED',
  'NO_PATCH_FOUND',
  'UNKNOWN_ERROR',
]);

export const ReviewSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    reviewMessage: z.string(),
    patchSize: z.number(),
  }),
});

export const ReviewFailureSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: ReviewErrorCode,
    message: z.string(),
    recoverable: z.boolean(),
  }),
});

export type ReviewResult =
  | z.infer<typeof ReviewSuccessSchema>
  | z.infer<typeof ReviewFailureSchema>;

export interface ReviewSpec {
  execute(input: ReviewInput): Promise<ReviewResult>;
}
