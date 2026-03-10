import { z } from 'zod';

export const SessionAnalysisInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required').startsWith('jules:session:', 'Invalid Session ID format'),
});

export type SessionAnalysisInput = z.infer<typeof SessionAnalysisInputSchema>;

export const SessionAnalysisErrorCode = z.enum([
  'SESSION_NOT_FOUND',
  'API_ERROR',
  'UNAUTHORIZED',
  'UNKNOWN_ERROR',
]);

export const SessionAnalysisSuccess = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    state: z.string(),
    summary: z.string(),
    totalActivities: z.number(),
    generatedFilesCount: z.number(),
    lastAgentMessage: z.string().optional(),
  }),
});

export const SessionAnalysisFailure = z.object({
  success: z.literal(false),
  error: z.object({
    code: SessionAnalysisErrorCode,
    message: z.string(),
    recoverable: z.boolean(),
  }),
});

export type SessionAnalysisResult =
  | z.infer<typeof SessionAnalysisSuccess>
  | z.infer<typeof SessionAnalysisFailure>;

export interface SessionAnalysisSpec {
  execute(input: SessionAnalysisInput): Promise<SessionAnalysisResult>;
}
