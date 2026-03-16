# MCP Plan Generation Server

An MCP server that exposes Jules session creation as a tool via the Model Context Protocol. Other AI agents can call `generate_plan` to create a Jules session that produces a structured coding plan with implementation details, build commands, and verification steps.

## Quick Start

```bash
npm install
export JULES_API_KEY="your-api-key"
bun run index.ts
```

Starts an MCP server on stdio transport.

## `generate_plan` Tool

Registered with `server.registerTool()` using Zod schemas for input validation:

```typescript
server.registerTool('generate_plan', {
  description: 'Generates a detailed coding plan with reference implementations...',
  inputSchema: {
    taskDescription: z.string().describe('The task or bug to solve.'),
    sourceContext: z.string().optional().describe('Optional source context.'),
  },
}, async ({ taskDescription, sourceContext }) => {
  const session = await jules.session({ prompt: `Create a detailed coding plan for: ${taskDescription}...` });

  let planContent = 'Plan generation produced no output.';
  for await (const activity of session.stream()) {
    if (activity.type === 'agentMessaged') {
      planContent = activity.message;
    }
  }

  return { content: [{ type: 'text', text: planContent }] };
});
```

The tool creates a repoless Jules session, streams activities to capture the agent's final message, and returns it as the tool result. Errors are returned with `isError: true` instead of throwing.

## Connecting to the Server

Add to your MCP client configuration (e.g., Claude Desktop, Cursor):

```json
{
  "mcpServers": {
    "jules-plan": {
      "command": "bun",
      "args": ["run", "/path/to/examples/mcp-plan-generation/index.ts"],
      "env": { "JULES_API_KEY": "your-key" }
    }
  }
}
```
