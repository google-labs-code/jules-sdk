import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { JulesClient } from '@google/jules-sdk';
import { tools } from '../tools.js';
import packageJson from '../../package.json' with { type: 'json' };

export class JulesMCPServer {
  private server: Server;
  private julesClient: JulesClient;

  constructor(julesClient: JulesClient) {
    this.julesClient = julesClient;
    this.server = new Server(
      {
        name: 'jules-mcp',
        version: packageJson.version,
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      },
    );

    this.registerHandlers();
  }

  private registerHandlers() {
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return this.handleListPrompts();
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const tool = tools.find((t) => t.name === name);

      if (!tool) {
        throw new Error(`Tool not found: ${name}`);
      }

      try {
        return await tool.handler(this.julesClient, args);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleListPrompts() {
    return {
      prompts: [
        {
          name: 'analyze_session',
          description: 'Analyze a Jules session with the LLM',
          arguments: [
            {
              name: 'sessionId',
              description: 'The Session ID to analyze',
              required: true,
            },
          ],
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Jules MCP Server running on stdio');
  }
}
