import { z } from 'zod';

export const sessionRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt cannot be empty'),
  githubRepo: z.string().optional(),
  baseBranch: z.string().optional(),
  autoPr: z.boolean().optional().default(false),
  fields: z.string().optional(), // field mask for limiting response size
});

export type SessionRequest = z.infer<typeof sessionRequestSchema>;

export const sessionResponseSchema = z.object({
  status: z.enum(['success', 'error']),
  message: z.string().optional(),
  data: z.any().optional(),
  error: z.string().optional(),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
