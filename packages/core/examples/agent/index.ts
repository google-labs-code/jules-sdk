import { jules } from '@google/jules-sdk';

/**
 * Agent Workflow Example
 *
 * This example demonstrates how to use `jules.all()` to orchestrate
 * multiple agent sessions concurrently.
 */
async function main() {
  console.log('Starting Agent Workflow Example...');

  // Define a list of tasks for the agents to complete
  const tasks = [
    'Analyze the repository and create a list of potential improvements',
    'Write a script to automate the deployment process',
    'Review the existing test suite and suggest additional test cases',
  ];

  console.log(`Creating ${tasks.length} sessions...`);

  // Use jules.all() to run sessions concurrently
  const sessions = await jules.all(
    tasks,
    (task) => ({
      prompt: task,
      // In a real scenario, you would provide a source repository:
      // source: { github: 'your-org/your-repo', baseBranch: 'main' },
    }),
    {
      concurrency: 2, // Limit concurrency to 2
      stopOnError: false, // Continue processing even if one session fails
    },
  );

  console.log(`Finished creating ${sessions.length} sessions.`);

  // Process the results
  for (const session of sessions) {
    console.log(`\nSession ${session.id}:`);

    // Wait for the session to complete and get the outcome
    try {
      const outcome = await session.result();
      console.log(`  State: ${outcome.state}`);

      if (outcome.state === 'failed') {
        console.log(`  Failed. Check logs or session stream for details.`);
      } else {
        // Retrieve generated files
        const files = outcome.generatedFiles();
        if (files.size > 0) {
          console.log(`  Generated ${files.size} files.`);
          for (const [path, _] of files.entries()) {
            console.log(`  - ${path}`);
          }
        } else {
          console.log('  No files generated.');
        }
      }
    } catch (error) {
      console.error(`  Error processing session ${session.id}:`, error);
    }
  }

  console.log('\nWorkflow complete.');
}

// Ensure JULES_API_KEY is set
if (!process.env.JULES_API_KEY) {
  console.error('Error: JULES_API_KEY environment variable is missing.');
  console.log('Please set it using: export JULES_API_KEY=<your-key>');
  process.exit(1);
}

main().catch(console.error);