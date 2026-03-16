# Google Docs Context

Fetches the text content of a Google Doc via the Docs API and sends it to Jules as context for a repoless session. The agent can then analyze, summarize, or act on the document content.

## Quick Start

```bash
export JULES_API_KEY="your-api-key"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"

# Analyze a Google Doc
bun run start --document-id "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2ktIg" \
  --prompt "Summarize the key points"
```

## Fetching Document Content

The handler authenticates with Google's Docs API using Application Default Credentials and fetches the document's structural elements:

```typescript
const docs = google.docs({ version: 'v1', auth });
const response = await docs.documents.get({ documentId });
```

Each structural element's paragraphs are flattened into plain text via `extractParagraphText()`, which iterates `paragraph.elements[].textRun.content`.

## Repoless Session with Document Context

The extracted text is appended to the user's prompt and sent to a repoless session via the shared `runRepolessSession()` helper:

```typescript
const outcome = await runRepolessSession(
  `${input.prompt}\n\n## Source Document Content\n${docText}`,
);
```

## Typed Service Contract Pattern

| File | Purpose |
|------|---------|
| `spec.ts` | Zod schemas for `RunSessionInput` (documentId, prompt) and `RunSessionResult` |
| `handler.ts` | `GoogleDocsSessionHandler` — fetches doc, runs session |
| `index.ts` | CLI wrapper with `citty` |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `JULES_API_KEY` | Yes | Jules API key |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | Path to GCP service account JSON |
