import { jules } from '@google/jules-sdk';
import { SessionRequest, SessionResponse, sessionRequestSchema } from './spec.js';
import { z } from 'zod';

/**
 * Validates the inputs to protect against hallucinated payloads from agents
 * and executes the command logic.
 */
export async function handleSessionRequest(input: unknown): Promise<SessionResponse> {
  try {
    // 1. Input Hardening
    // Protect against common agent hallucinations by enforcing a strict schema.
    const validParams = sessionRequestSchema.parse(input);

    if (!process.env.JULES_API_KEY) {
      return {
        status: 'error',
        error: 'JULES_API_KEY environment variable is not set.',
      };
    }

    // Prepare session configuration based on inputs
    const sessionConfig: any = {
      prompt: validParams.prompt,
    };

    if (validParams.githubRepo) {
      sessionConfig.source = {
        github: validParams.githubRepo,
        baseBranch: validParams.baseBranch || 'main',
      };
      if (validParams.autoPr) {
        sessionConfig.autoPr = validParams.autoPr;
      }
    }

    // Execute the core business logic (calling the Jules API)
    const session = await jules.session(sessionConfig);
    const outcome = await session.result();

    // Process response based on field mask if requested to limit context size
    let resultData: any = {
      sessionId: session.id,
      state: outcome.state,
    };

    if (outcome.state === 'completed') {
       const snapshot = await session.snapshot();
       const agentMessages = snapshot.activities
        .filter((a: any) => a.type === 'agentMessaged')
        .sort((a: any, b: any) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime());

       const files = outcome.generatedFiles();
       const fileData: Record<string, string> = {};

       for (const [filename, content] of files.entries()) {
         fileData[filename] = content.content;
       }

       resultData.agentMessages = agentMessages.map((m: any) => m.message);
       resultData.files = fileData;
    }

    // Extremely basic field masking - pick requested top-level fields
    if (validParams.fields) {
        const maskedData: any = {};
        const fields = validParams.fields.split(',').map(f => f.trim());
        for (const field of fields) {
            if (resultData[field] !== undefined) {
                maskedData[field] = resultData[field];
            }
        }
        resultData = maskedData;
    }

    return {
      status: 'success',
      data: resultData,
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
