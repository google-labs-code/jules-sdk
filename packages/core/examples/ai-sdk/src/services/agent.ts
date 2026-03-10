import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { executeCodingTask } from '../tools/jules-coding-task/index.js';

export interface AgentRequest {
  prompt: string;
  repo?: string;
}

export interface AgentResponse {
  success: boolean;
  result?: string;
  toolCalls?: Array<{ name: string; args: any }>;
  error?: string;
}

/**
 * Encapsulates the Vercel AI SDK logic.
 * This service handles calling the LLM and managing available tools.
 */
export async function runAgent(request: AgentRequest): Promise<AgentResponse> {
  const contextPrompt = request.repo
    ? `Task: ${request.prompt}\nContext: Apply this task to the repository "${request.repo}".`
    : `Task: ${request.prompt}`;

  try {
    const { text, toolCalls } = await generateText({
      model: google('gemini-3.1-flash-lite-preview'),
      prompt: contextPrompt,
      tools: {
        executeCodingTask,
      },
      maxSteps: 2,
    });

    return {
      success: true,
      result: text,
      toolCalls: toolCalls?.map((c) => ({ name: c.toolName, args: c.args })) || [],
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || String(error),
    };
  }
}
