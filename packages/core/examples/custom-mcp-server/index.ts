import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { jules } from '@google/jules-sdk';

/**
 * Custom MCP Server Example
 *
 * This example demonstrates how to create a custom Model Context Protocol (MCP)
 * server that wraps the Jules SDK. This allows other AI assistants (like Claude,
 * Zed, etc.) to use Jules to orchestrate complex coding tasks or queries.
 */

// 1. Initialize the MCP Server
const server = new Server(
  {
    name: 'jules-custom-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// 2. Define the tools available to the MCP client
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'run_jules_task',
        description: 'Run a Repoless Jules session to answer a question or complete a standalone task',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The instructions or query for the Jules agent',
            },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'get_jules_sessions',
        description: 'Query the local cache for recent Jules sessions',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of sessions to return',
            },
          },
        },
      },
    ],
  };
});

// 3. Handle tool execution requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'run_jules_task') {
      const prompt = String(args?.prompt || '');
      if (!prompt) {
        throw new Error('Prompt is required');
      }

      // Use the Jules SDK to run a session
      const session = await jules.session({ prompt });
      const result = await session.result();

      // Attempt to extract the primary generated markdown file or the final state
      let answer = `Session finished with state: ${result.state}`;
      const files = result.generatedFiles();
      if (files.size > 0) {
        // Just return the first file's content for simplicity
        for (const [_, content] of files.entries()) {
           answer = content.content;
           break;
        }
      }

      return {
        content: [{ type: 'text', text: answer }],
      };
    }

    if (name === 'get_jules_sessions') {
      const limit = Number(args?.limit) || 5;

      // Query recent sessions using Jules SDK
      const sessions = await jules.select({
        from: 'sessions',
        limit,
      });

      const summary = sessions.map(
        (s) => `ID: ${s.id} | Status: ${s.state} | URL: ${s.url}`
      ).join('\n');

      return {
        content: [{ type: 'text', text: summary || 'No sessions found.' }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: String(error) }],
    };
  }
});

// 4. Start the server using stdio transport
async function main() {
  if (!process.env.JULES_API_KEY) {
    console.error('Warning: JULES_API_KEY environment variable is missing.');
    console.error('The tools will fail if they require SDK calls to the backend.');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Custom Jules MCP Server is running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
