import { jules } from '@google/jules-sdk';
import cron from 'node-cron';

/**
 * Cron Jobs Example
 *
 * Demonstrates how to trigger a Jules session from a scheduled cron job using `node-cron`.
 * This can be useful for regular tasks such as running a daily review or nightly automation script.
 */
async function runTask() {
  console.log(`[${new Date().toISOString()}] Cron job triggered! Creating a Jules session...`);

  try {
    // For demonstration, we run a repoless session generating a simple joke.
    // In a real-world scenario, you might pass a source repo and specific automation instructions.
    const session = await jules.session({
      prompt: 'Write a short programmer joke.',
    });

    console.log(`Session created! ID: ${session.id}`);
    console.log('Waiting for the session to complete...');

    const outcome = await session.result();

    console.log('\n--- Session Result ---');
    console.log(`State: ${outcome.state}`);

    if (outcome.state === 'completed') {
      const activities = await jules.select({
        from: 'activities',
        where: { type: 'agentMessaged', 'session.id': session.id },
        order: 'desc',
        limit: 1,
      });

      if (activities.length > 0) {
        console.log('\nAgent Response:');
        console.log(activities[0].message);
      } else {
        const files = outcome.generatedFiles();
        if (files.size > 0) {
            console.log('\nGenerated Files:');
            for (const [filename, content] of files.entries()) {
                console.log(`\nFile: ${filename}`);
                console.log(content.content);
            }
        } else {
            console.log('\nThe agent did not leave a final message or file.');
        }
      }
    } else {
      console.error('The session did not complete successfully.');
    }
  } catch (error) {
    console.error('An error occurred during the scheduled session:', error);
  }
}

function main() {
  if (!process.env.JULES_API_KEY) {
    console.error('Error: JULES_API_KEY environment variable is not set.');
    console.error('Please set it using: export JULES_API_KEY="your-api-key"');
    process.exit(1);
  }

  // Schedule a task to run every minute for demonstration purposes.
  // The cron expression '* * * * *' means "every minute".
  console.log('Starting cron job scheduler. It will trigger every minute...');
  console.log('Press Ctrl+C to exit.');

  cron.schedule('* * * * *', () => {
    // Avoid unhandled promise rejections by wrapping the async call in a catch block if needed
    // However, runTask has its own try/catch block.
    runTask();
  });
}

main();
