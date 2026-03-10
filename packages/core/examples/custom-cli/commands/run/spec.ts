import { z } from 'zod';

export const runTaskRequestSchema = z.object({
  instruction: z.string().min(1, 'Task instruction is required.'),
  inputFile: z.string().optional(),
  outputFile: z.string().min(1, 'Output file path is required to save the result.'),
  timeoutMins: z.number().optional().default(5),
  dryRun: z.boolean().optional().default(false),
});

export type RunTaskRequest = z.infer<typeof runTaskRequestSchema>;

export const runTaskResponseSchema = z.object({
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

export type RunTaskResponse = z.infer<typeof runTaskResponseSchema>;
