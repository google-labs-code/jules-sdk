import { defineCommand } from 'citty';
import { handleGenerateTestRequest } from './handler.js';
import { niftty } from 'niftty';

export default defineCommand({
  meta: {
    name: 'generate-test',
    description: 'Reads a local source file and automatically generates a unit test file next to it.',
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
    filepath: {
      type: 'string',
      description: 'Human-friendly flag for specifying the file path.',
    },
    framework: {
      type: 'string',
      description: 'Testing framework to use (e.g. vitest, jest). Default: vitest',
      default: 'vitest',
    },
    instructions: {
      type: 'string',
      description: 'Additional instructions for the agent.',
    },
    'dry-run': {
      type: 'boolean',
      description: 'Generate the test and print it to the console, but do not write it to disk.',
      default: false,
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
    } else if (args.filepath) {
      payload.filepath = args.filepath;
      payload.testFramework = args.framework;
      if (args.instructions) payload.instructions = args.instructions;
      if (args['dry-run']) payload.dryRun = true;
    } else {
      console.error(JSON.stringify({ status: 'error', error: 'Must provide either --json or --filepath' }));
      process.exit(1);
    }

    const isJsonOutput = args.output === 'json' || process.env.OUTPUT_FORMAT === 'json';

    if (!isJsonOutput) {
       console.log(`Analyzing file and generating test suite...\n`);
    }

    // Call the Typed Service Contract handler
    const response = await handleGenerateTestRequest(payload);

    if (isJsonOutput) {
      // Agent DX: Provide deterministic, machine-readable JSON
      console.log(JSON.stringify(response, null, 2));
    } else {
      // Human DX: Render readable output
      if (response.status === 'error') {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }

      console.log(response.message);

      if (response.data?.content && args['dry-run']) {
        console.log('\n--- Generated Test Code ---');
        console.log(niftty(`\`\`\`\n${response.data.content}\n\`\`\``));
      }
    }

    if (response.status === 'error') {
      process.exit(1);
    }
  },
});
