import { jules } from '@google/jules-sdk';

/**
 * Custom CLI Tool Example
 *
 * Demonstrates how to build a simple command-line interface tool
 * using the Jules SDK. This script accepts a prompt as an argument,
 * executes it using a repoless Jules session, and prints the result.
 */
async function main() {
  // 1. Parse command-line arguments to get the user prompt
  const args = process.argv.slice(2);
  const prompt = args.join(' ').trim();

  // Validate the API key
  if (!process.env.JULES_API_KEY) {
    console.error('Error: JULES_API_KEY environment variable is not set.');
    console.error('Please set it using: export JULES_API_KEY="your-api-key"');
    process.exit(1);
  }

  // Ensure a prompt was provided
  if (!prompt) {
    console.error('Usage: bun run index.ts <your-prompt>');
    console.error('Example: bun run index.ts "Write a quick sorting algorithm in Python"');
    process.exit(1);
  }

  console.log(`Executing: "${prompt}"...`);

  try {
    // 2. Create a repoless session with the provided prompt
    const session = await jules.session({ prompt });

    console.log(`\nSession created! ID: ${session.id}`);
    console.log('Waiting for completion (this may take a moment)...\n');

    // 3. Await the final outcome of the session
    const outcome = await session.result();

    if (outcome.state === 'completed') {
      // 4. Retrieve generated output or agent messages
      const activities = await jules.select({
        from: 'activities',
        where: { type: 'agentMessaged', 'session.id': session.id },
        order: 'desc',
        limit: 1,
      });

      if (activities.length > 0) {
        console.log('--- Agent Response ---');
        console.log(activities[0].message);
      } else {
        // Fallback: Check if there are generated files instead
        const files = outcome.generatedFiles();
        if (files.size > 0) {
          console.log('--- Generated Files ---');
          for (const [filename, content] of files.entries()) {
            console.log(`\nFile: ${filename}`);
            console.log(content.content);
          }
        } else {
          console.log('The session completed, but no direct response or file output was found.');
        }
      }
    } else {
      console.error(`Session finished with state: ${outcome.state}`);
      console.error('The task could not be completed successfully.');
    }
  } catch (error) {
    console.error('An error occurred while communicating with Jules:', error);
    process.exit(1);
  }
}

// Run the CLI
main();