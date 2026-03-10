import { jules } from '@google/jules-sdk';
import { GenerateTestRequest, GenerateTestResponse, generateTestRequestSchema } from './spec.js';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Reads a local file, sends its contents to Jules to generate a test file,
 * and writes the result back to the user's local filesystem.
 */
export async function handleGenerateTestRequest(input: unknown): Promise<GenerateTestResponse> {
  try {
    // 1. Input Hardening
    const validParams = generateTestRequestSchema.parse(input);

    if (!process.env.JULES_API_KEY) {
      return {
        status: 'error',
        error: 'JULES_API_KEY environment variable is not set.',
      };
    }

    // Resolve the file path relative to cwd
    const targetFilePath = path.resolve(process.cwd(), validParams.filepath);

    // Ensure the file exists
    let sourceContent: string;
    try {
      sourceContent = await fs.readFile(targetFilePath, 'utf-8');
    } catch (e: any) {
      return {
        status: 'error',
        error: `Failed to read source file at ${targetFilePath}: ${e.message}`,
      };
    }

    // Prepare prompt
    const parsedPath = path.parse(targetFilePath);
    const expectedTestFilename = `${parsedPath.name}.test${parsedPath.ext}`;

    let userInstructions = validParams.instructions
      ? `\n\nAdditional Instructions:\n${validParams.instructions}`
      : '';

    const prompt = `You are an expert test engineer. Write comprehensive unit tests for the following file.
Use the testing framework: ${validParams.testFramework}

Target Filename: ${parsedPath.base}
Target File Content:
\`\`\`
${sourceContent}
\`\`\`${userInstructions}

Return ONLY the code for the test file named \`${expectedTestFilename}\`. Do not provide conversational filler.`;

    // Execute session
    const session = await jules.session({ prompt });
    const outcome = await session.result();

    if (outcome.state !== 'completed') {
      return {
        status: 'error',
        error: `Jules session did not complete successfully. Status: ${outcome.state}`,
      };
    }

    // Attempt to extract the generated test file from the generatedFiles map
    const files = outcome.generatedFiles();
    let generatedTestCode: string | null = null;
    let finalTestFilename = expectedTestFilename;

    // Look for the explicitly named test file
    if (files.has(expectedTestFilename)) {
      generatedTestCode = files.get(expectedTestFilename)!.content;
    } else if (files.size > 0) {
      // Fallback: Just grab the first generated file if names don't match
      const firstEntry = Array.from(files.entries())[0];
      finalTestFilename = firstEntry[0];
      generatedTestCode = firstEntry[1].content;
    } else {
       // Fallback 2: The agent might have just messaged the code back
       const snapshot = await session.snapshot();
       const agentMessages = snapshot.activities
        .filter((a: any) => a.type === 'agentMessaged')
        .sort((a: any, b: any) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime());

       if (agentMessages.length > 0) {
           const message = agentMessages[0].message;
           // Extract code block
           const match = message.match(/\`\`\`[a-zA-Z]*\n([\s\S]*?)\n\`\`\`/);
           if (match) {
               generatedTestCode = match[1];
           } else {
               generatedTestCode = message; // Hope for the best
           }
       }
    }

    if (!generatedTestCode) {
      return {
        status: 'error',
        error: 'Failed to extract generated test code from Jules response.',
      };
    }

    // Calculate destination path (e.g., adjacent to the source file)
    const testDestinationPath = path.join(parsedPath.dir, finalTestFilename);

    // If it's not a dry run, actually write to the filesystem
    if (!validParams.dryRun) {
      try {
        await fs.writeFile(testDestinationPath, generatedTestCode, 'utf-8');
      } catch (e: any) {
        return {
          status: 'error',
          error: `Failed to write test file to ${testDestinationPath}: ${e.message}`,
        };
      }
    }

    return {
      status: 'success',
      message: validParams.dryRun
        ? `[DRY-RUN] Would have written test file to ${testDestinationPath}`
        : `Successfully wrote test file to ${testDestinationPath}`,
      data: {
        sourceFile: targetFilePath,
        testFile: testDestinationPath,
        content: generatedTestCode,
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
