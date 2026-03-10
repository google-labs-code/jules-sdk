import { jules } from '@google/jules-sdk';
import { google } from 'googleapis';

/**
 * Google Sheets Context Example
 *
 * Demonstrates reading data from a Google Sheet and using it as context
 * to create a Jules session.
 */
async function main() {
  if (!process.env.JULES_API_KEY) {
    console.error('Error: JULES_API_KEY environment variable is not set.');
    console.error('Please set it using: export JULES_API_KEY="your-api-key"');
    process.exit(1);
  }

  // Authentication Setup for Google API
  // Uses Application Default Credentials by default (GOOGLE_APPLICATION_CREDENTIALS)
  // or checks running environment (e.g., GCE, GKE)
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Example public Google Sheet: "Class Data" from Google Sheets API examples
  const spreadsheetId = process.env.SPREADSHEET_ID || '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
  const range = 'Class Data!A2:E';

  console.log('Fetching data from Google Sheets...');
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('No data found in the spreadsheet.');
      return;
    }

    console.log(`Found ${rows.length} rows of data. Formatting as context...`);

    // Format data as context. Here we create a simple text representation.
    // Each row is joined by a comma, and rows are separated by newlines.
    const sheetContext = rows.map(row => row.join(', ')).join('\n');

    console.log('\nCreating a Jules session with the Sheet context...');

    // Create a repoless session passing the spreadsheet data in the prompt
    const session = await jules.session({
      prompt: `Analyze the following student data from a Google Sheet and provide a brief summary of the key demographics and trends (e.g., major distribution, class year distribution):\n\n${sheetContext}`,
    });

    console.log(`Session created! ID: ${session.id}`);
    console.log('Waiting for the agent to analyze the data...');

    const outcome = await session.result();
    console.log(`\n--- Session Result ---`);
    console.log(`State: ${outcome.state}`);

    if (outcome.state === 'completed') {
      // Retrieve the final agent message
      const activities = await jules.select({
        from: 'activities',
        where: { type: 'agentMessaged', 'session.id': session.id },
        order: 'desc',
        limit: 1,
      });

      if (activities.length > 0) {
        console.log('\nAgent Analysis:');
        console.log(activities[0].message);
      } else {
        console.log('\nThe agent did not leave a final message.');

        // Check for any generated files instead
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
    console.error('An error occurred:', error);
    if (error instanceof Error && error.message.includes('Could not load the default credentials')) {
        console.error('\nMake sure to set your GOOGLE_APPLICATION_CREDENTIALS environment variable');
        console.error('to the path of your Google Cloud service account key file.');
    }
  }
}

// Run the example
main();
