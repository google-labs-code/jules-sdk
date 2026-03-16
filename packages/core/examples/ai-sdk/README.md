# Vercel AI SDK Integration

CLI that uses the Vercel AI SDK's `streamText()` with Google's Gemini model to run an AI agent that can delegate coding tasks to Jules as a tool. The agent decides when to call Jules based on the prompt, streams its reasoning in real-time, and reports the results.

## Quick Start

```bash
npm install
export JULES_API_KEY="your-api-key"
export GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-key"

# The agent decides if it needs Jules
bun start start --prompt "Write a Python script that sorts a list of numbers"

# Target a specific repo (enables auto-PR)
bun start start --prompt "Add input validation" --repo owner/repo

# JSON output for programmatic use
bun start start --prompt "Fix the bug in auth.ts" --output json

# Dry run (validates without creating real sessions)
bun start start --prompt "Refactor the utils module" --dry-run
```

## Jules as a Vercel AI SDK Tool

The `executeCodingTask` tool wraps a Jules session in the AI SDK's `tool()` format with Zod-validated inputs:

```typescript
const result = streamText({
  model: google('gemini-3.1-flash-lite-preview'),
  prompt,
  tools: { executeCodingTask },
  stopWhen: stepCountIs(3),
});
```

When the model decides a coding task is needed, it calls the tool. The handler creates a Jules session, streams its activities, and returns the final state including PR URL and generated files.

## Input Hardening

Zod schemas reject malicious or hallucinated inputs — control characters, pre-URL-encoded strings, path traversals, query params, and invalid repo formats are all caught at the boundary:

```typescript
const SafeRepoSchema = z.string()
  .regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/)
  .refine(v => !v.includes('..'), 'Path traversal');
```

## Streaming Callbacks

`runAgent()` accepts callbacks for real-time output:
- `onTextChunk` — LLM text deltas as they arrive
- `onToolCall` — when the model invokes `executeCodingTask`
- `onToolResult` — when the Jules session returns

## Configuration

| Flag | Default | Description |
|------|---------|-------------|
| `--prompt` | — | Required. The coding task |
| `--repo` | — | GitHub repo (`owner/repo`, enables auto-PR) |
| `--output` | `text` | Output format: `text` or `json` |
| `--dry-run` | `false` | Validate without creating sessions |

## Key Files

| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI entry with `citty` |
| `src/commands/start.ts` | Env validation, calls `runAgent()` |
| `src/services/agent.ts` | `streamText()` orchestration with Gemini |
| `src/tools/jules-coding-task/handler.ts` | Jules session creation and streaming |
| `src/tools/jules-coding-task/spec.ts` | Zod schemas with input hardening |
| `src/tools/jules-coding-task/index.ts` | AI SDK `tool()` wrapper |
