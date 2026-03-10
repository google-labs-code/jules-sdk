import { defineCommand, runMain } from 'citty';
import { ReviewHandler } from './src/handler.js';
import { ReviewInputSchema } from './src/spec.js';

const main = defineCommand({
  meta: {
    name: 'jules-gitpatch-review',
    version: '1.0.0',
    description: 'Use Jules to review generated code patches against GitHub repo context.',
  },
  args: {
    repository: {
      type: 'string',
      description: 'The target GitHub repository (e.g. owner/repo)',
      required: true,
      alias: 'r',
    },
    baseBranch: {
      type: 'string',
      description: 'The base branch of the repository',
      default: 'main',
      alias: 'b',
    },
    prompt: {
      type: 'string',
      description: 'The prompt to generate the code change',
      required: true,
      alias: 'p',
    },
    json: {
      type: 'boolean',
      description: 'Output the final result as JSON',
      default: false,
    },
  },
  async run({ args }) {
    // 1. Validate Input (Parse, don't validate)
    const inputResult = ReviewInputSchema.safeParse({
      repository: args.repository,
      baseBranch: args.baseBranch,
      prompt: args.prompt,
      json: args.json,
    });

    if (!inputResult.success) {
      console.error('Invalid arguments provided:');
      console.error(inputResult.error.format());
      process.exit(1);
    }

    // 2. Instantiate the Handler
    const handler = new ReviewHandler();

    // 3. Execute Business Logic
    const result = await handler.execute(inputResult.data);

    // 4. Handle Results Deterministically
    if (!result.success) {
      if (args.json) {
        console.error(JSON.stringify(result.error, null, 2));
      } else {
        console.error(`\n[ERROR] ${result.error.code}: ${result.error.message}`);
        if (result.error.suggestion) {
          console.error(`Suggestion: ${result.error.suggestion}`);
        }
      }
      process.exit(1);
    }

    // 5. Output Success State
    if (args.json) {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.log('\n=======================================');
      console.log('         REVIEW COMPLETE');
      console.log('=======================================\n');
      console.log(result.data.reviewMessage);
    }
  },
});

runMain(main);
