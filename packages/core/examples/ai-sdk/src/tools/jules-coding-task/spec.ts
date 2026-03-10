import { z } from 'zod';

// 1. INPUT HARDENING (Agent DX)
// Agents hallucinate and pass malformed inputs. We validate strictly at the boundary.
const SafeStringSchema = z.string()
  .refine(s => !/[\x00-\x1F]/.test(s), "Control characters are not allowed")
  .refine(s => !s.includes('%'), "Pre-URL encoded strings are not allowed");

const SafeRepoSchema = SafeStringSchema
  .refine(r => !r.includes('..'), "Path traversals are not allowed in repo names")
  .refine(r => !r.includes('?'), "Query parameters are not allowed in repo names")
  .refine(r => !r.includes('#'), "Fragments are not allowed in repo names")
  .refine(r => r.split('/').length === 2, "Repo must be in the format owner/repo");

export const JulesCodingTaskInputSchema = z.object({
  prompt: SafeStringSchema.describe('Detailed instructions for the coding task, including what needs to be changed.'),
  githubRepo: SafeRepoSchema.optional().describe('The GitHub repository in the format "owner/repo" (e.g. "google/jules-sdk"). If omitted, it runs a repoless session.'),
  baseBranch: SafeStringSchema.optional().describe('The base branch to make the changes against. Defaults to "main" if repo provided.'),
  dryRun: z.boolean().default(false).describe('If true, validates the input and returns a success message without actually creating a Jules session.'),
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
