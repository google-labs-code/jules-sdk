import { defineCommand } from 'citty';
import { handleSessionRequest } from './handler.js';
import { niftty } from 'niftty';

export default defineCommand({
  meta: {
    name: 'session',
    description: 'Executes a Jules Session, optimized for Agents.',
  },
  args: {
    json: {
      type: 'string',
      description: 'Raw JSON payload mapped directly to the API schema.',
    },
    output: {
      type: 'string',
      description: 'Format of the output (e.g., "json" or "text"). Defaults to text for humans, but "json" is critical for agents.',
      default: 'text',
    },
    prompt: {
      type: 'string',
      description: 'Human-friendly flag for simple tasks.',
    },
  },
  async run({ args }) {
    let payload: any = {};

    // Favor raw JSON payloads for agent predictability
    if (args.json) {
      try {
        payload = JSON.parse(args.json);
      } catch (err) {
        console.error(JSON.stringify({ status: 'error', error: 'Invalid JSON payload format' }));
        process.exit(1);
      }
    } else if (args.prompt) {
      payload.prompt = args.prompt;
    } else {
      console.error(JSON.stringify({ status: 'error', error: 'Must provide either --json or --prompt' }));
      process.exit(1);
    }

    const isJsonOutput = args.output === 'json' || process.env.OUTPUT_FORMAT === 'json';

    if (!isJsonOutput) {
       console.log(`Executing session...\n`);
    }

    // Call the Typed Service Contract handler
    const response = await handleSessionRequest(payload);

    if (isJsonOutput) {
      // Agent DX: Provide deterministic, machine-readable JSON
      console.log(JSON.stringify(response, null, 2));
    } else {
      // Human DX: Render readable output
      if (response.status === 'error') {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }

      if (response.data?.agentMessages?.length) {
        console.log('--- Agent Response ---');
        console.log(niftty(response.data.agentMessages[0]));
      }

      if (response.data?.files) {
        for (const [filename, content] of Object.entries(response.data.files)) {
          console.log(`\nFile: ${filename}`);
          console.log(niftty(`\`\`\`\n${content}\n\`\`\``));
        }
      }
    }

    if (response.status === 'error') {
      process.exit(1);
    }
  },
});
