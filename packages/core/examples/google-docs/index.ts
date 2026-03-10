import { defineCommand, runMain } from 'citty';
import { RunSessionInputSchema } from './spec.js';
import { GoogleDocsSessionHandler } from './handler.js';

const mainCommand = defineCommand({
  meta: {
    name: 'google-docs-context',
    version: '1.0.0',
    description: 'A CLI tool that reads from a Google Document and uses the content to start a Jules session.',
  },
  args: {
    documentId: {
      type: 'string',
      description: 'The ID of the Google Document to read from',
      required: true,
      alias: 'd',
    },
    prompt: {
      type: 'string',
      description: 'The initial prompt to give to the Jules session, instructing it on what to do with the document content',
      required: true,
      alias: 'p',
    },
    json: {
      type: 'boolean',
      description: 'Output response as JSON',
      default: false,
    },
  },
  async run({ args }) {
    // Input validation
    const inputResult = RunSessionInputSchema.safeParse(args);

    if (!inputResult.success) {
      if (args.json) {
        console.error(JSON.stringify({ error: inputResult.error.errors }));
      } else {
        console.error('Validation Error:', inputResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
      }
      process.exit(1);
    }

    if (!args.json) {
       console.log('Fetching Google Document content and initializing session...');
    }

    const handler = new GoogleDocsSessionHandler();
    const result = await handler.execute(inputResult.data);

    if (!result.success) {
      if (args.json) {
        console.error(JSON.stringify(result.error));
      } else {
        console.error(`Error (${result.error.code}): ${result.error.message}`);
        if (result.error.recoverable) {
           console.log('Suggestion: Check your credentials and input values.');
        }
      }
      process.exit(1);
    }

    if (args.json) {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.log(`\nSession Completed!`);
      console.log(`Session ID: ${result.data.sessionId}`);
      console.log(`State: ${result.data.state}`);

      if (result.data.agentMessage) {
        console.log(`\nAgent Analysis:\n${result.data.agentMessage}`);
      } else if (result.data.files) {
        console.log('\nGenerated Files:');
        for (const [filename, content] of Object.entries(result.data.files)) {
          console.log(`\nFile: ${filename}\n${content}`);
        }
      }
    }
  },
});

runMain(mainCommand);
