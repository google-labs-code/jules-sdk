import { jules } from '@google/jules-sdk';
import { RunTaskRequest, RunTaskResponse, runTaskRequestSchema } from './spec.js';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Treats Jules as a powerful, on-demand serverless compute instance.
 * Sends local file context to a cloud environment where an AI agent
 * runs scripts (e.g., Python scraping, data analysis), and writes the
 * final processed output back to the local file system.
 */
export async function handleRunTaskRequest(input: unknown): Promise<RunTaskResponse> {
  try {
    // 1. Input Hardening
    const validParams = runTaskRequestSchema.parse(input);

    if (!process.env.JULES_API_KEY) {
      return {
        status: 'error',
        error: 'JULES_API_KEY environment variable is not set.',
      };
    }

    let fileContext = '';

    // 2. Local File Context Integration
    if (validParams.inputFile) {
      const inputFilePath = path.resolve(process.cwd(), validParams.inputFile);
      try {
        const content = await fs.readFile(inputFilePath, 'utf-8');
        const parsedPath = path.parse(inputFilePath);

        fileContext = `
## Input Data
You have been provided with the following data from a local file named \`${parsedPath.base}\`:

\`\`\`
${content}
\`\`\`
        `;
      } catch (e: any) {
        return {
          status: 'error',
          error: `Failed to read input file at ${inputFilePath}: ${e.message}`,
        };
      }
    }

    // 3. Formulate the "Serverless Compute" Prompt
    // We strictly instruct the agent on its environment capabilities and output constraints.
    const EXPECTED_OUTPUT_FILE = 'final_output.txt';
    const prompt = `
You are an autonomous Cloud Compute Agent operating within a secure serverless container.
You have access to a full Linux environment with Node.js, Python, Rust, and Bun installed.
You have unrestricted outbound internet access.

## Your Objective
${validParams.instruction}
${fileContext}

## Execution Rules
1. You may write and execute scripts (e.g., Python, Node) to solve this objective. This includes scraping websites, processing data, querying APIs, or running analysis.
2. DO NOT just write the script and ask me to run it. YOU MUST run the script yourself in your container to get the final result.
3. Install any necessary dependencies using your environment's package managers (npm, pip).
4. Once you have the final, processed result for the user's objective, you MUST write that final text/JSON result to a file named \`${EXPECTED_OUTPUT_FILE}\` in your current working directory.
5. Do not include conversational filler in \`${EXPECTED_OUTPUT_FILE}\`, only the exact output requested by the objective.

Remember: The success of this objective relies entirely on you generating and populating \`${EXPECTED_OUTPUT_FILE}\`.
    `;

    // 4. Delegate to the Jules SDK Cloud Session
    const session = await jules.session({ prompt });
    const outcome = await session.result();

    if (outcome.state !== 'completed') {
      return {
        status: 'error',
        error: `The cloud compute session failed or timed out. Status: ${outcome.state}`,
      };
    }

    // 5. Retrieve the requested output file
    const files = outcome.generatedFiles();
    let finalOutputContent: string | null = null;

    if (files.has(EXPECTED_OUTPUT_FILE)) {
      finalOutputContent = files.get(EXPECTED_OUTPUT_FILE)!.content;
    } else {
        // Fallback: search for any generated file if the agent ignored instructions
        if (files.size > 0) {
            const firstFile = Array.from(files.values())[0];
            finalOutputContent = firstFile.content;
        } else {
           // Fallback 2: Check messages if the agent just messaged the response instead of writing to disk
           const snapshot = await session.snapshot();
           const agentMessages = snapshot.activities
            .filter((a: any) => a.type === 'agentMessaged')
            .sort((a: any, b: any) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime());

           if (agentMessages.length > 0) {
              finalOutputContent = agentMessages[0].message;
           }
        }
    }

    if (!finalOutputContent) {
      return {
        status: 'error',
        error: `Cloud compute session completed but failed to produce the expected output data.`,
      };
    }

    // 6. Write to the local file system
    const targetOutputPath = path.resolve(process.cwd(), validParams.outputFile);

    if (!validParams.dryRun) {
      try {
        await fs.writeFile(targetOutputPath, finalOutputContent, 'utf-8');
      } catch (e: any) {
        return {
          status: 'error',
          error: `Failed to write output to ${targetOutputPath}: ${e.message}`,
        };
      }
    }

    return {
      status: 'success',
      message: validParams.dryRun
        ? `[DRY-RUN] Would have written processed output to ${targetOutputPath}`
        : `Successfully wrote processed output to ${targetOutputPath}`,
      data: {
        sessionId: session.id,
        outputFile: targetOutputPath,
        contentPreview: finalOutputContent.substring(0, 500) + (finalOutputContent.length > 500 ? '...' : ''),
        dryRun: validParams.dryRun,
      }
    };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: 'error',
        error: `Validation Error: ${error.message}`,
      };
    }

    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      error: errMsg,
    };
  }
}
