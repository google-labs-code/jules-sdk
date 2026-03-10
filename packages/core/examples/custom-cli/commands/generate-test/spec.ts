import { z } from 'zod';

export const generateTestRequestSchema = z.object({
  filepath: z.string().min(1, 'Filepath is required to generate tests for'),
  testFramework: z.string().optional().default('vitest'),
  instructions: z.string().optional(),
  dryRun: z.boolean().optional().default(false),
});

export type GenerateTestRequest = z.infer<typeof generateTestRequestSchema>;

export const generateTestResponseSchema = z.object({
  status: z.enum(['success', 'error']),
  message: z.string().optional(),
  data: z.object({
    sourceFile: z.string().optional(),
    testFile: z.string().optional(),
    content: z.string().optional(),
    dryRun: z.boolean().optional(),
  }).optional(),
  error: z.string().optional(),
});

export type GenerateTestResponse = z.infer<typeof generateTestResponseSchema>;
