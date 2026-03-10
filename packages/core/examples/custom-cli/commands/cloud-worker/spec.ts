import { z } from 'zod';

export const cloudWorkerRequestSchema = z.object({
  task: z.string().min(1, 'Task description is required.'),
  inputFile: z.string().optional(),
  outputFile: z.string().min(1, 'Output file path is required to save the result.'),
  timeoutMins: z.number().optional().default(5),
  dryRun: z.boolean().optional().default(false),
});

export type CloudWorkerRequest = z.infer<typeof cloudWorkerRequestSchema>;

export const cloudWorkerResponseSchema = z.object({
  status: z.enum(['success', 'error']),
  message: z.string().optional(),
  data: z.object({
    outputFile: z.string().optional(),
    sessionId: z.string().optional(),
    contentPreview: z.string().optional(),
    dryRun: z.boolean().optional(),
  }).optional(),
  error: z.string().optional(),
});

export type CloudWorkerResponse = z.infer<typeof cloudWorkerResponseSchema>;
