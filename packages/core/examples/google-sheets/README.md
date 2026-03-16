# Google Sheets Context

Fetches data from a Google Sheets range via the Sheets API and sends it to Jules as context for a repoless session. The agent can then analyze, transform, or generate code based on the spreadsheet data.

## Quick Start

```bash
export JULES_API_KEY="your-api-key"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"

# Analyze spreadsheet data
bun run start --spreadsheet-id "your-spreadsheet-id" \
  --range "Sheet1!A1:D10" \
  --prompt "Generate a chart from this data"
```

## Fetching Sheet Data

The handler authenticates with Google's Sheets API and fetches the specified range:

```typescript
const sheets = google.sheets({ version: 'v4', auth });
const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
```

Each row is joined with commas, and rows are joined with newlines — simple CSV-like formatting that works well in prompts.

## Repoless Session with Spreadsheet Context

The formatted data is appended to the prompt and sent to a repoless session via `runRepolessSession()`:

```typescript
const outcome = await runRepolessSession(
  `${input.prompt}\n\n## Source Data\n${sheetData}`,
);
```

## Typed Service Contract Pattern

| File | Purpose |
|------|---------|
| `spec.ts` | Zod schemas for `RunSessionInput` (spreadsheetId, range, prompt) and `RunSessionResult` |
| `handler.ts` | `GoogleSheetsSessionHandler` — fetches data, runs session |
| `index.ts` | CLI wrapper with `citty` |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `JULES_API_KEY` | Yes | Jules API key |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | Path to GCP service account JSON |
