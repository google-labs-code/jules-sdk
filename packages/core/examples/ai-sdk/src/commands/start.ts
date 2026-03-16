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

    const isJson = args.output === 'json';

    if (!isJson) {
      console.log('--- Streaming Response ---\n');
    }

    // 2. Execute with streaming callbacks for human-readable output
    const result = await runAgent(
      {
        prompt: args.prompt,
        repo: args.repo,
        dryRun: args['dry-run'],
      },
      // onTextChunk: stream text to stdout in real-time
      isJson ? undefined : (text) => process.stdout.write(text),
      // onToolCall: show when a tool is being invoked
      isJson ? undefined : (name, input) => {
        console.log(`\n\n🔧 Calling tool: ${name}`);
        console.log(`   Input: ${JSON.stringify(input)}`);
        console.log('   Waiting for result...\n');
      },
      // onToolResult: show the tool's output
      isJson ? undefined : (name, output) => {
        console.log(`\n✅ Tool result (${name}):`);
        console.log(`   ${output}\n`);
      },
    );

    // 3. Handle final output
    if (isJson) {
      console.log(JSON.stringify({
        success: result.success,
        text: result.text,
        toolCalls: result.toolCalls,
        error: result.error,
      }, null, 2));
      if (!result.success) process.exit(1);
    } else {
      if (!result.success) {
        console.error('\n\nExecution Failed:', result.error);
        process.exit(1);
      }
      console.log('\n');
    }
  },
});
