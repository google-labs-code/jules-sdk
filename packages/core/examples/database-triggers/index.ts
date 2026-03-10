import { Client } from 'pg';
import { jules } from '@google/jules-sdk';

/**
 * Example demonstrating how to listen to a PostgreSQL database trigger/event using LISTEN/NOTIFY
 * and trigger a Jules session when an event occurs.
 */
async function main() {
  // Use connection string from environment variables, or a default one for local development
  const connectionString =
    process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';

  const client = new Client({ connectionString });

  try {
    console.log(`Connecting to database at ${connectionString}...`);
    await client.connect();
    console.log('Connected.');

    // Listen to a specific channel (e.g., 'user_updates')
    const channelName = 'user_updates';
    await client.query(`LISTEN ${channelName}`);
    console.log(`Listening for notifications on channel: ${channelName}`);

    // Handle incoming notifications
    client.on('notification', async (msg) => {
      console.log(`Received notification on ${msg.channel}:`, msg.payload);

      try {
        let parsedPayload = msg.payload ? JSON.parse(msg.payload) : {};

        console.log('Creating Jules session for event...');

        // Create a new Jules session
        const session = await jules.session({
          prompt: `Process the following database event: ${JSON.stringify(parsedPayload, null, 2)}

          **Instructions**
          1. Analyze the change.
          2. Update relevant systems or code based on the new data.`,

          // Using a repoless session for this example, or provide a source
          // source: { github: 'your-org/your-repo', baseBranch: 'main' },
        });

        console.log(`Successfully created Jules session: ${session.id}`);

      } catch (err) {
        console.error('Error handling notification or creating session:', err);
      }
    });

    // Keep the process alive
    process.on('SIGINT', async () => {
      console.log('Closing database connection...');
      await client.end();
      process.exit(0);
    });

  } catch (error) {
    console.error('Error connecting to database:', error);
    process.exit(1);
  }
}

main();
