import { jules } from '@google/jules-sdk';

/**
 * Basic Session Example
 *
 * Demonstrates a simple interaction with the Jules SDK.
 * It creates a repoless session (no GitHub source), provides a simple prompt,
 * and awaits the final outcome.
 */
async function main() {
  // Ensure the JULES_API_KEY environment variable is set.
  if (!process.env.JULES_API_KEY) {
    console.error('Error: JULES_API_KEY environment variable is not set.');
    console.error('Please set it using: export JULES_API_KEY="your-api-key"');
    process.exit(1);
  }

  console.log('Creating a new Jules session...');

  try {
    // 1. Create a basic session
    // We use a repoless session (no source) for this simple demonstration.
    const session = await jules.session({
      prompt: 'Write a haiku about artificial intelligence programming itself.',
    });

    console.log(`Session created! ID: ${session.id}`);
    console.log('Waiting for the agent to complete the task...');

    // 2. Await the result of the session
    // This will poll the API until the session reaches a terminal state (completed or failed).
    const outcome = await session.result();

    console.log('\n--- Session Result ---');
    console.log(`State: ${outcome.state}`);

    if (outcome.state === 'completed') {
      // 3. Retrieve and display the final message from the agent
      // Since it's a haiku, we expect it in the generated files or the agent's messages.
      // Often, the agent writes its final output to a file or answers in a message.
      // Let's print out the latest agent message.
      const activities = await jules.select({
          from: 'activities',
          where: { type: 'agentMessaged', 'session.id': session.id },
          order: 'desc',
          limit: 1,
      });

      if (activities.length > 0) {
        console.log('\nAgent Message:');
        console.log(activities[0].message);
      } else {
        console.log('\nThe agent did not leave a final message.');

        // Let's check generated files
        const files = outcome.generatedFiles();
        if (files.size > 0) {
            console.log('\nGenerated Files:');
            for (const [filename, content] of files.entries()) {
                console.log(`\nFile: ${filename}`);
                console.log(content.content);
            }
        }
      }
    } else {
      console.error('The session did not complete successfully.');
    }

  } catch (error) {
    console.error('An error occurred during the session:', error);
  }
}

// Run the example
main();
