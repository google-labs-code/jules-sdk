import { defineCommand, runMain } from 'citty';
import { AnalyzeGitPatchInputSchema } from './spec.js';
import { AnalyzeGitPatchHandler } from './handler.js';

const main = defineCommand({
  meta: {
    name: 'gitpatch-improve',
    version: '1.0.0',
    description: 'CLI to analyze GitPatch data for code improvements using Jules SDK.',
  },
  args: {
    repo: {
      type: 'string',
      description: 'The GitHub repository to analyze (e.g., davideast/dataprompt)',
      default: 'davideast/dataprompt',
      alias: 'r',
    },
    limit: {
      type: 'string',
      description: 'Number of recent activities to search for GitPatch data',
      default: '10',
      alias: 'l',
    },
  },
  async run({ args }) {
    console.log(`Starting GitPatch Improve analysis...`);

    // Parse input
    const input = AnalyzeGitPatchInputSchema.safeParse({
      sourceRepo: args.repo,
      limit: parseInt(args.limit, 10),
    });

    if (!input.success) {
      console.error('Invalid arguments provided:');
      console.error(input.error.errors);
      process.exit(1);
    }

    const handler = new AnalyzeGitPatchHandler();
    const result = await handler.execute(input.data);

    if (!result.success) {
      console.error(`Error: [${result.error.code}] ${result.error.message}`);
      if (result.error.suggestion) {
        console.error(`Suggestion: ${result.error.suggestion}`);
      }
      process.exit(1);
    }

    console.log('\n--- Analysis Report ---');
    console.log(`From Source Session ID: ${result.data.sourceSessionId}`);
    console.log(result.data.analysis);
    console.log('-----------------------\n');
  },
});

runMain(main);
