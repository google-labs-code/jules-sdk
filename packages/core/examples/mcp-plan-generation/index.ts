#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { jules } from '@google/jules-sdk';

async function runMcpServer() {
  const server = new McpServer({
    name: 'jules-mcp-plan-generation',
    version: '1.0.0',
  });

  server.registerTool('generate_plan', {
    description: 'Generates a detailed coding plan with reference implementations, build/test commands, and verification checks.',
    inputSchema: {
      taskDescription: z.string().describe('The task or bug to solve.'),
      sourceContext: z.string().optional().describe('Optional source context (repo name, file paths).'),
    },
  }, async ({ taskDescription, sourceContext }) => {
    try {
      const session = await jules.session({
        prompt: `Create a detailed coding plan for: ${taskDescription}\n${sourceContext ? `\nContext:\n${sourceContext}` : ''}\n\nInclude: reference implementation, build commands, test commands, verification checks. Format in Markdown.`,
      });

      let planContent = 'Plan generation produced no output.';

      session.result().then(outcome => {
        console.error(`Plan session ${outcome.state}.`);
      });

      for await (const activity of session.stream()) {
        if (activity.type === 'agentMessaged') {
          planContent = activity.message;
        }
      }

      return { content: [{ type: 'text' as const, text: planContent }] };
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Failed: ${error.message}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Jules MCP Plan Generation Server running on stdio');
}

const main = defineCommand({
  meta: { name: 'jules-mcp-plan-generation', version: '1.0.0', description: 'Jules MCP Server for generating coding plans.' },
  async run() {
    await runMcpServer();
  },
});

runMain(main).catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});
