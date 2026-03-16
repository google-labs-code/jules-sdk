import { defineCommand, runMain } from 'citty';
import { ApplyPatchInputSchema, ApplyPatchResultSchema } from './spec.js';
import { ApplyPatchHandler } from './handler.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Gitpatch Local Example
 *
 * Demonstrates how to use Jules' session GitPatch data to download
 * and patch the code locally in a new branch on the user's machine.
 */
const main = defineCommand({
  meta: {
    name: 'jules-gitpatch-local',
    version: '1.0.0',
    description: 'Applies a GitPatch from a Jules session to a local branch',
  },
  args: {
    sessionId: {
      type: 'positional',
      description: 'The ID of the Jules session to extract the patch from',
      required: true,
    },
    branch: {
      type: 'string',
      description: 'The name of the new local branch to apply changes to (optional)',
      required: false,
    },
    json: {
      type: 'boolean',
      description: 'Output the result as JSON for agent interoperability',
      required: false,
      default: false,
    },
    'dry-run': {
      type: 'boolean',
      description: 'Simulate the operation without mutating local files or git state',
      required: false,
      default: false,
    },
    describe: {
      type: 'boolean',
      description: 'Output the JSON schemas for the input and output types for Agent introspection',
      required: false,
      default: false,
    },
  },
  async run({ args }) {
    // 0. Introspection (Agent Documentation)
    if (args.describe) {
      console.log(
        JSON.stringify(
          {
            inputSchema: zodToJsonSchema(ApplyPatchInputSchema as any),
            outputSchema: zodToJsonSchema(ApplyPatchResultSchema as any),
          },
          null,
          2
        )
      );
      process.exit(0);
    }

    if (!process.env.JULES_API_KEY) {
      if (args.json) {
        console.error(JSON.stringify({ error: 'JULES_API_KEY environment variable is not set.' }));
      } else {
        console.error('Error: JULES_API_KEY environment variable is not set.');
        console.error('Please set it using: export JULES_API_KEY="your-api-key"');
      }
      process.exit(1);
    }

    // 1. Validate Input (Parse, don't validate)
    const inputResult = ApplyPatchInputSchema.safeParse({
      sessionId: args.sessionId,
      targetBranch: args.branch,
      dryRun: args['dry-run'],
    });

    if (!inputResult.success) {
      if (args.json) {
        console.error(JSON.stringify({ error: 'Invalid input', details: inputResult.error.issues }));
      } else {
        console.error('Validation Error:');
        inputResult.error.issues.forEach((i) => console.error(` - ${i.message}`));
      }
      process.exit(1);
    }

    // 2. Execute Handler
    const handler = new ApplyPatchHandler();
    const result = await handler.execute(inputResult.data);

    // 3. Handle Output (Agent DX vs Human DX)
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (!result.success) {
        console.error(`[Error] ${result.error.code}: ${result.error.message}`);
        process.exit(1);
      } else {
        console.log(`Successfully checked out branch: ${result.data.branchName}`);
        console.log(`Patch applied and committed!`);
      }
    }

    if (!result.success) {
      process.exit(1);
    }
  },
});

// Run the example CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  runMain(main);
}
