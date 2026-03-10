import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SessionAnalysisHandler } from './commands/session-analysis/handler.js';
import { SessionAnalysisInputSchema } from './commands/session-analysis/spec.js';

export async function runMcpServer() {
  if (!process.env.JULES_API_KEY) {
    console.error('Warning: JULES_API_KEY environment variable is missing.');
  }

  // 1. Initialize the MCP Server
  const server = new McpServer({
    name: 'jules-custom-mcp-server',
    version: '1.0.0',
  });

  // 2. Define tools mapped to handlers
  server.tool(
    'analyze_session',
    'Provides a detailed analysis and context of a Jules Session, including states and generated artifacts. Replaces brittle local cache lookups with full hydration.',
    {
      sessionId: z.string().describe('The Jules session ID to analyze, e.g., jules:session:123'),
    },
    async ({ sessionId }) => {
      const parsedInput = SessionAnalysisInputSchema.safeParse({ sessionId });
      if (!parsedInput.success) {
        return {
          content: [{ type: 'text', text: `Validation Error: ${parsedInput.error.message}` }],
          isError: true,
        };
      }

      const handler = new SessionAnalysisHandler();
      const result = await handler.execute(parsedInput.data);

      if (!result.success) {
         return {
           content: [{ type: 'text', text: `Analysis Failed [${result.error.code}]: ${result.error.message}` }],
           isError: true,
         };
      }

      const { data } = result;
      const formatted = [
        `Session Analysis: ${data.id}`,
        `State: ${data.state}`,
        `Summary: ${data.summary}`,
        `Files Generated: ${data.generatedFilesCount}`,
        data.lastAgentMessage ? `\nLast Agent Message:\n${data.lastAgentMessage}` : '',
      ].filter(Boolean).join('\n');

      return {
        content: [{ type: 'text', text: formatted }],
      };
    }
  );

  // 3. Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Custom Jules MCP Server is running on stdio');
}
