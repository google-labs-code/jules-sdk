# Vercel AI SDK Integration Example (Agent DX CLI)

This example demonstrates how to integrate the Jules SDK with the Vercel AI SDK to provide AI-powered coding capabilities within an AI application.

Following **Agent DX best practices**, this example is packaged as a CLI built with `citty`. It utilizes the `generateText` function from the `ai` package and Google's `gemini-3.1-flash-lite-preview` model.

The AI is given a composable, isolated tool called `executeCodingTask` that internally uses the Jules SDK to spin up a cloud environment and perform complex coding tasks. The tool is implemented using the **Typed Service Contract** pattern, providing rigorous type safety, input parsing (via Zod), and explicit error handling (Result Pattern).

## Prerequisites

- Node.js or Bun installed.
- A Jules API Key. Set it using:
  ```bash
  export JULES_API_KEY=<your-api-key>
  ```
- A Google Generative AI API Key. Set it using:
  ```bash
  export GOOGLE_GENERATIVE_AI_API_KEY=<your-google-api-key>
  ```

## Running the Example

You can run this example using `bun`:

### Standard Human-Friendly Output
```bash
bun start start --prompt "Fix visibility issues by changing background colors to a zinc palette." --repo "your-org/your-repo"
```

### Agent-Friendly JSON Output (Agent DX)
```bash
bun start start --prompt "Fix visibility issues." --output json
```

## Architecture

This project is structured for predictability and minimizing merge conflicts:

1.  **CLI Entrypoint (`src/cli.ts`)**: Minimal registration boundary built with `citty`. It lazily registers subcommands (e.g. `start`) to avoid central hotspots as the CLI scales.
2.  **Command Modules (`src/commands/*.ts`)**: Isolated entrypoints for flags, CLI argument parsing, environment variable logic checks, and selecting the output format (`--output json`).
3.  **Services (`src/services/agent.ts`)**: Encapsulates the Vercel AI SDK logic (`generateText` with `@ai-sdk/google`) to abstract the specific LLM interactions away from the CLI layer.
4.  **Tool Spec (`src/tools/jules-coding-task/spec.ts`)**: The Contract boundary. Parses tool input using Zod and defines a strict `Result` return type.
5.  **Tool Handler (`src/tools/jules-coding-task/handler.ts`)**: The impure business logic. It initiates `jules.session()`, waits for the session to complete, and evaluates the `session.result()`. It *never* throws errors.
6.  **Tool Wrapper (`src/tools/jules-coding-task/index.ts`)**: Maps the typed contract into a standard Vercel AI SDK `tool()` wrapper.
