import { jules } from '@google/jules-sdk';
import { RunTaskResponse, runTaskRequestSchema } from './spec.js';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Treats Jules as a powerful, on-demand serverless compute instance.
 * Streams progress from the cloud session and writes the final output locally.
 */
export async function handleRunTaskRequest(input: unknown): Promise<RunTaskResponse> {
  try {
    const validParams = runTaskRequestSchema.parse(input);

    if (!process.env.JULES_API_KEY) {
      return { status: 'error', error: 'JULES_API_KEY environment variable is not set.' };
    }

    let fileContext = '';
    if (validParams.inputFile) {
      const inputFilePath = path.resolve(process.cwd(), validParams.inputFile);
      try {
        const content = await fs.readFile(inputFilePath, 'utf-8');
        fileContext = `\n## Input Data\nFrom local file \`${path.parse(inputFilePath).base}\`:\n\`\`\`\n${content}\n\`\`\``;
      } catch (e: any) {
        return { status: 'error', error: `Failed to read input file: ${e.message}` };
      }
    }

    const EXPECTED_OUTPUT_FILE = 'final_output.txt';
    const prompt = `
You are an autonomous Cloud Compute Agent with a full Linux environment.
## Objective
${validParams.instruction}
${fileContext}
## Rules
1. Write and run scripts yourself. Install dependencies as needed.
2. Write the final result to \`${EXPECTED_OUTPUT_FILE}\`.
`;

    const session = await jules.session({ prompt });
    console.error(`Session created: ${session.id}`);

    // Stream progress, collect the agent's final message as output
    let finalContent: string | null = null;

    session.result().then(outcome => {
      console.error(`Session ${outcome.state}.`);
    });

    for await (const activity of session.stream()) {
      if (activity.type === 'agentMessaged') {
        // The last agent message typically contains or references the output
        finalContent = activity.message;
        console.error(`Agent: ${activity.message.slice(0, 120)}`);
      }
    }

    if (!finalContent) {
      return { status: 'error', error: 'Session completed but no output file was produced.' };
    }

    const targetOutputPath = path.resolve(process.cwd(), validParams.outputFile);

    if (!validParams.dryRun) {
      await fs.writeFile(targetOutputPath, finalContent, 'utf-8');
    }

    return {
      status: 'success',
      message: validParams.dryRun
        ? `[DRY-RUN] Would write to ${targetOutputPath}`
        : `Wrote output to ${targetOutputPath}`,
      data: {
        sessionId: session.id,
        outputFile: targetOutputPath,
        contentPreview: finalContent.substring(0, 500),
        dryRun: validParams.dryRun,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: 'error', error: `Validation Error: ${error.message}` };
    }
    return { status: 'error', error: error instanceof Error ? error.message : String(error) };
  }
}
