# Custom MCP Server Example

This example demonstrates how to create a custom MCP (Model Context Protocol) server that integrates with the Jules TypeScript SDK.

The custom MCP server provides tools to other AI assistants, allowing them to:
1. Orchestrate Jules sessions locally or in the cloud.
2. Query data, summarize files, or prepare plans to pass as context.

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
    "jules-custom": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/this/example/index.ts"],
      "env": {
        "JULES_API_KEY": "your-api-key"
      }
    }
  }
}
```
