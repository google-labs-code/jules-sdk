import { z } from 'zod';

// 1. INPUT
export const JulesCodingTaskInputSchema = z.object({
  prompt: z.string().describe('Detailed instructions for the coding task, including what needs to be changed.'),
  githubRepo: z.string().optional().describe('The GitHub repository in the format "owner/repo" (e.g. "google/jules-sdk"). If omitted, it runs a repoless session.'),
  baseBranch: z.string().optional().describe('The base branch to make the changes against. Defaults to "main" if repo provided.'),
});

export type JulesCodingTaskInput = z.infer<typeof JulesCodingTaskInputSchema>;

// 2. ERROR CODES
export const JulesCodingTaskErrorCode = z.enum([
  'SESSION_FAILED',
  'MISSING_CREDENTIALS',
  'INVALID_INPUT',
  'UNKNOWN_ERROR'
]);

// 3. RESULT
export const JulesCodingTaskSuccess = z.object({
  success: z.literal(true),
  data: z.object({
    sessionId: z.string(),
    state: z.string(),
    pullRequestUrl: z.string().optional(),
    generatedFilesCount: z.number().optional(),
  }),
});

export const JulesCodingTaskFailure = z.object({
  success: z.literal(false),
  error: z.object({
    code: JulesCodingTaskErrorCode,
    message: z.string(),
    recoverable: z.boolean(),
  })
});

export type JulesCodingTaskResult =
  | z.infer<typeof JulesCodingTaskSuccess>
  | z.infer<typeof JulesCodingTaskFailure>;

// 4. INTERFACE
export interface JulesCodingTaskSpec {
  execute(input: JulesCodingTaskInput): Promise<JulesCodingTaskResult>;
}
