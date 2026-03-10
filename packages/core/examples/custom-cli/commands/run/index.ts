import { defineCommand } from 'citty';
import { handleRunTaskRequest } from './handler.js';
import { niftty } from 'niftty';

export default defineCommand({
  meta: {
    name: 'run',
    description: 'Offloads complex tasks (web scraping, data analysis, scripting) to an autonomous serverless container.',
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
    instruction: {
      type: 'string',
      description: 'A description of the complex task or script you want the compute instance to execute in the cloud.',
    },
    input: {
      type: 'string',
      description: 'Optional path to a local file containing data you want to send to the compute instance.',
    },
    'output-file': {
      type: 'string',
      description: 'Path where the compute instance should save the final processed result locally.',
    },
    'dry-run': {
      type: 'boolean',
      description: 'Execute the compute instance and fetch the result, but do not write it to the local disk.',
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
    } else if (args.instruction && args['output-file']) {
      payload.instruction = args.instruction;
      payload.outputFile = args['output-file'];
      if (args.input) payload.inputFile = args.input;
      if (args['dry-run']) payload.dryRun = true;
    } else {
      console.error(JSON.stringify({ status: 'error', error: 'Must provide either --json or both --instruction and --output-file' }));
      process.exit(1);
    }

    const isJsonOutput = args.output === 'json' || process.env.OUTPUT_FORMAT === 'json';

    if (!isJsonOutput) {
       console.log(`\n☁️  Sending task to Cloud Compute container...\n`);
       if (payload.inputFile) {
         console.log(`Uploading local context: ${payload.inputFile}`);
       }
       console.log(`Waiting for serverless execution to run scripts and return final output...\n`);
    }

    // Call the Typed Service Contract handler
    const response = await handleRunTaskRequest(payload);

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

      if (response.data?.contentPreview) {
        console.log('\n--- Output Preview ---');
        console.log(niftty(`\`\`\`\n${response.data.contentPreview}\n\`\`\``));
      }
    }

    if (response.status === 'error') {
      process.exit(1);
    }
  },
});
