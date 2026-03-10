import { defineCommand } from 'citty';
import { runAgent } from '../services/agent.js';

export default defineCommand({
  meta: {
    name: 'start',
    description: 'Start an agent session to handle a coding prompt.',
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
    'dry-run': {
      type: 'boolean',
      description: 'Validate input and logic without creating a real cloud session.',
      default: false,
    },
  },
  async run({ args }) {
    // 1. Logic Checks: Validate Environment Context explicitly before attempting external operations
    if (!process.env.JULES_API_KEY) {
      console.error('Error: JULES_API_KEY environment variable is missing.');
      process.exit(1);
    }

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.error('Error: GOOGLE_GENERATIVE_AI_API_KEY environment variable is missing.');
      process.exit(1);
    }

    // 2. Encapsulate execution in the service abstraction
    const response = await runAgent({
      prompt: args.prompt,
      repo: args.repo,
      dryRun: args['dry-run'],
    });

    // 3. Render payload strictly conforming to output format expectation (Agent DX vs Human)
    if (args.output === 'json') {
      if (response.success) {
        console.log(
          JSON.stringify(
            {
              success: true,
              result: response.result,
              toolCalls: response.toolCalls,
            },
            null,
            2,
          ),
        );
      } else {
        console.error(
          JSON.stringify(
            {
              success: false,
              error: response.error,
            },
            null,
            2,
          ),
        );
        process.exit(1);
      }
    } else {
      if (response.success) {
        console.log('\n--- Final Response from AI ---');
        console.log(response.result);
        if (response.toolCalls && response.toolCalls.length > 0) {
          console.log('\n--- Tools Invoked ---');
          response.toolCalls.forEach((c) => console.log(`- ${c.name}`));
        }
      } else {
        console.error('Execution Failed:', response.error);
        process.exit(1);
      }
    }
  },
});
