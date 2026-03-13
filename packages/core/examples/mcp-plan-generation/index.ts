#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { jules } from '@google/jules-sdk';

async function runMcpServer() {
  if (!process.env.JULES_API_KEY) {
    console.error('Warning: JULES_API_KEY environment variable is missing.');
  }

  const server = new McpServer({
    name: 'jules-mcp-plan-generation',
    version: '1.0.0',
  });

  server.tool(
    'generate_plan',
    'Generates a highly detailed coding plan including reference implementations, build/test commands, and verification checks. This output can be used as a prompt to create a new Jules session.',
    {
      taskDescription: z.string().describe('The user\'s requested task or bug to solve.'),
      sourceContext: z.string().optional().describe('Optional context about the source code, e.g., a GitHub repo name or file paths.'),
    },
    async ({ taskDescription, sourceContext }) => {
      try {
        const prompt = `You are an expert coding agent. Create a highly detailed plan to accomplish the following task:
${taskDescription}

${sourceContext ? `Source Context:\n${sourceContext}\n` : ''}
The plan MUST include:
1. Reference implementation details.
2. Build commands to verify compilation.
3. Test commands to verify correctness.
4. Additional verification checks (e.g., linting, manual testing steps).

Format the output cleanly in Markdown so it can be used directly as a prompt for another Jules session.`;

        const session = await jules.session({
          prompt,
        });

        const outcome = await session.result();
        const files = outcome.generatedFiles();

        // Find the main markdown output, or fallback to the last agent message
        let planContent = 'Plan generation failed to produce an output.';

        for (const [filename, file] of files) {
          if (filename.endsWith('.md')) {
            planContent = file.content;
            break;
          }
        }

        if (planContent === 'Plan generation failed to produce an output.' && outcome.lastAgentMessage) {
           planContent = outcome.lastAgentMessage;
        }

        return {
          content: [{ type: 'text', text: planContent }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Failed to generate plan: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Jules MCP Plan Generation Server is running on stdio');
}

const main = defineCommand({
  meta: {
    name: 'jules-mcp-plan-generation',
    version: '1.0.0',
    description: 'A Custom Jules MCP Server to generate highly detailed plans for coding agents.',
  },
  async run() {
    await runMcpServer();
  },
});

runMain(main).catch((error) => {
  console.error('Fatal CLI Error:', error);
  process.exit(1);
});
