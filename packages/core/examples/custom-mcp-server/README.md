# Custom MCP Server CLI Example

This example demonstrates how to create a custom MCP (Model Context Protocol) server wrapped as a CLI tool using the Jules TypeScript SDK, `citty`, and the **Typed Service Contract** pattern.

Instead of basic data forwarding, it provides an `analyze_session` tool. It hydrates a Jules session snapshot, extracting the actual file states and final AI context, avoiding partial cache-only issues.

## Setup and Running

1. Ensure your `JULES_API_KEY` is set in your environment:
   ```bash
   export JULES_API_KEY="your-jules-api-key"
   ```

2. Run the example using Bun (or another TypeScript runner like `tsx`):
   ```bash
   bun run index.ts
   ```

## Integration

You can add this server to your local MCP client configuration (e.g., Claude Desktop, Zed, or a VS Code MCP extension) to allow it to utilize Jules' agentic capabilities directly from your IDE or chat client.

Example Claude Desktop Config:
```json
{
  "mcpServers": {
    "jules-custom-cli": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/this/example/index.ts"],
      "env": {
        "JULES_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Typed Service Contract Pattern

This CLI implements the Vertical Slice Architecture using a strict `Spec` and `Handler` pattern in `src/commands/session-analysis/`:
- **spec.ts**: Defines the input Schema using Zod (parsing input, enforcing boundaries), exhaustively declares error codes, and strictly types the return interface as a Discriminated Union `Result`.
- **handler.ts**: The impure execution context. It implements the interface, interacts with the Jules SDK network layer, and maps runtime and API errors to the defined Spec failures instead of throwing them wildly.
