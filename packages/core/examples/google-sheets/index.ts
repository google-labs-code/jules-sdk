import { defineCommand, runMain } from 'citty';
import { RunSessionInputSchema } from './spec.js';
import { GoogleSheetsSessionHandler } from './handler.js';

const mainCommand = defineCommand({
  meta: {
    name: 'google-sheets-context',
    version: '1.0.0',
    description: 'A CLI tool that reads from a Google Sheet and uses the data to start a Jules session.',
  },
  args: {
    spreadsheetId: {
      type: 'string',
      description: 'The ID of the Google Spreadsheet to read from',
      required: true,
      alias: 's',
    },
    range: {
      type: 'string',
      description: 'The A1 notation of the values to retrieve (e.g. "Class Data!A2:E")',
      required: true,
      alias: 'r',
    },
    prompt: {
      type: 'string',
      description: 'The initial prompt to give to the Jules session, instructing it on what to do with the data',
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
        console.error(JSON.stringify({ error: inputResult.error.issues }));
      } else {
        console.error('Validation Error:', inputResult.error.issues.map((e) => `${(e.path as string[]).join('.')}: ${e.message}`).join(', '));
      }
      process.exit(1);
    }

    if (!args.json) {
       console.log('Fetching Google Sheet data and initializing session...');
    }

    const handler = new GoogleSheetsSessionHandler();
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
