import { defineCommand, runMain } from 'citty';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { executeCodingTask } from './tools/jules-coding-task/index.js';

const main = defineCommand({
  meta: {
    name: 'ai-sdk-example',
    version: '1.0.0',
    description: 'A CLI demonstrating Vercel AI SDK integration with Jules SDK using Agent DX principles.',
  },
  args: {
    prompt: {
      type: 'string',
      description: 'The coding prompt to feed the AI.',
      required: true,
    },
    output: {
      type: 'string',
      description: 'Output format (json or text). Use json for agents.',
      default: 'text',
    },
    repo: {
      type: 'string',
      description: 'Optional GitHub repository (e.g. "owner/repo").',
      required: false,
    },
  },
  async run({ args }) {
    if (!process.env.JULES_API_KEY) {
      console.error('Error: JULES_API_KEY environment variable is missing.');
      process.exit(1);
    }

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.error('Error: GOOGLE_GENERATIVE_AI_API_KEY environment variable is missing.');
      process.exit(1);
    }

    try {
      // Create user context including the repo if provided
      const contextPrompt = args.repo
        ? `Task: ${args.prompt}\nContext: Apply this task to the repository "${args.repo}".`
        : `Task: ${args.prompt}`;

      const { text, toolCalls } = await generateText({
        model: google('gemini-3.1-flash-lite-preview'),
        prompt: contextPrompt,
        tools: {
          executeCodingTask,
        },
        maxSteps: 2,
      });

      if (args.output === 'json') {
        console.log(JSON.stringify({
          success: true,
          result: text,
          toolCalls: toolCalls?.map(c => ({ name: c.toolName, args: c.args })) || []
        }, null, 2));
      } else {
        console.log('\n--- Final Response from AI ---');
        console.log(text);
        if (toolCalls && toolCalls.length > 0) {
          console.log('\n--- Tools Invoked ---');
          toolCalls.forEach(c => console.log(`- ${c.toolName}`));
        }
      }
    } catch (error: any) {
      if (args.output === 'json') {
        console.error(JSON.stringify({
          success: false,
          error: error.message || String(error)
        }, null, 2));
      } else {
        console.error('Execution Failed:', error.message || String(error));
      }
      process.exit(1);
    }
  },
});

runMain(main);
