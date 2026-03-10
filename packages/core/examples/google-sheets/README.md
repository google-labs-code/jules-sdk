# Google Sheets Context Example

This example demonstrates how to extract tabular data from a Google Sheet using the `googleapis` library and pass it as context into an interactive Jules session prompt.

## Requirements

- Node.js >= 18 or Bun
- A Jules API Key (`JULES_API_KEY` environment variable)
- Google Cloud Service Account Credentials configured for application default (`GOOGLE_APPLICATION_CREDENTIALS` environment variable)
- Enable the Google Sheets API in your Google Cloud Project.

## Setup

1. Make sure you have installed the SDK dependencies in the project root by running `bun install`.

2. Export your Jules API key:
   ```bash
   export JULES_API_KEY="your-api-key-here"
   ```

3. Export your Google Cloud Credentials JSON file path:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-file.json"
   ```

4. (Optional) Provide your own spreadsheet ID. By default, it uses a public sample sheet:
   ```bash
   export SPREADSHEET_ID="your-spreadsheet-id"
   ```

## Running the Example

Navigate to this directory and use `bun` to run the file:

```bash
bun run index.ts
```

Using `npm` and `tsx` (or similar TypeScript runner):

```bash
npx tsx index.ts
```

## What it does

The script authenticates with Google Cloud using Application Default Credentials to retrieve rows from the provided spreadsheet ID using the range `Class Data!A2:E`. It extracts this information, converts the rows into comma-separated text grouped by newlines, and appends it to a prompt given to an AI agent in `jules.session`. It waits for the agent to complete the task and displays the final analysis response.
