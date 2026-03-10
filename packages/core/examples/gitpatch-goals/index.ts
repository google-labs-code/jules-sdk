import { defineCommand, runMain } from 'citty';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ReviewInputSchema } from './spec.js';
import { ReviewHandler } from './handler.js';

// ============================================================================
// CLI CONFIGURATION (citty)
// ============================================================================

const main = defineCommand({
  meta: {
    name: 'gitpatch-goals',
    description: 'Generates code and reviews it via GitPatch against original goals.',
  },
  args: {
    prompt: {
      type: 'string',
      description: 'The initial prompt/goal for code generation',
      default:
        'Create a simple Node.js HTTP server that listens on port 8080 and serves "Hello, World!".',
      alias: 'p',
    },
    json: {
      type: 'boolean',
      description: 'Output the result as JSON',
      default: false,
    },
    'dry-run': {
      type: 'boolean',
      description: 'Simulates the command without making API calls',
      default: false,
    },
    describe: {
      type: 'boolean',
      description: 'Prints the JSON schema for this command and exits',
      default: false,
    },
  },
  async run({ args }) {
    if (args.describe) {
      const schema = zodToJsonSchema(ReviewInputSchema, 'ReviewInput');
      console.log(JSON.stringify(schema, null, 2));
      process.exit(0);
    }

    if (!process.env.JULES_API_KEY) {
      console.error('Error: JULES_API_KEY environment variable is missing.');
      process.exit(1);
    }

    const parseResult = ReviewInputSchema.safeParse({
      prompt: args.prompt,
      dryRun: args['dry-run'],
    });
    if (!parseResult.success) {
      console.error('Invalid input:', parseResult.error.format());
      process.exit(1);
    }

    const handler = new ReviewHandler();
    const result = await handler.execute(parseResult.data);

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.success) {
        console.log('\n======================================================');
        console.log('REVIEW RESULTS');
        console.log('======================================================\n');
        console.log(result.data.reviewMessage);
      } else {
        console.error('\nFAILED:', result.error.message);
      }
    }

    process.exit(result.success ? 0 : 1);
  },
});

runMain(main);
