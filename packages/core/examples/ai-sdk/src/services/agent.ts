import { streamText, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { executeCodingTask } from '../tools/jules-coding-task/index.js';

export interface AgentRequest {
  prompt: string;
  repo?: string;
  dryRun?: boolean;
}

export interface AgentResult {
  success: boolean;
  text: string;
  toolCalls: Array<{ name: string; input: any; output: string }>;
  error?: string;
}

/**
 * Runs the AI agent with streaming output.
 * Yields text chunks as they arrive, then returns the final result.
 */
export async function runAgent(
  request: AgentRequest,
  onTextChunk?: (text: string) => void,
  onToolCall?: (toolName: string, input: any) => void,
  onToolResult?: (toolName: string, output: string) => void,
): Promise<AgentResult> {
  const contextPrompt = request.repo
    ? `Task: ${request.prompt}\nContext: Apply this task to the repository "${request.repo}".`
    : `Task: ${request.prompt}`;

  try {
    const result = streamText({
      model: google('gemini-3.1-flash-lite-preview'),
      system: request.dryRun
        ? "You are in dry-run mode. ALWAYS pass dryRun: true to any tools you execute."
        : "",
      prompt: contextPrompt,
      tools: {
        executeCodingTask,
      },
      stopWhen: stepCountIs(3),
    });

    const toolCalls: AgentResult['toolCalls'] = [];
    let fullText = '';

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          fullText += part.text;
          onTextChunk?.(part.text);
          break;
        case 'tool-call':
          onToolCall?.(part.toolName, part.input);
          break;
        case 'tool-result':
          const output = typeof part.output === 'string' ? part.output : JSON.stringify(part.output);
          toolCalls.push({
            name: part.toolName,
            input: part.input,
            output,
          });
          onToolResult?.(part.toolName, output);
          break;
      }
    }

    return {
      success: true,
      text: fullText,
      toolCalls,
    };
  } catch (error: any) {
    return {
      success: false,
      text: '',
      toolCalls: [],
      error: error.message || String(error),
    };
  }
}
