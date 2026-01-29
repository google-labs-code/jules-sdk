import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JulesMCPServer } from '../src/server/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListPromptsRequestSchema,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

vi.mock('@modelcontextprotocol/sdk/server/index.js');
vi.mock('@modelcontextprotocol/sdk/server/stdio.js');

describe('JulesMCPServer', () => {
  let mockJulesClient: any;
  let mockServerInstance: any;
  let server: JulesMCPServer;
  let listPromptsHandler: Function;
  let listToolsHandler: Function;
  let callToolHandler: Function;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Server instance
    mockServerInstance = {
      setRequestHandler: vi.fn(),
      connect: vi.fn(),
    };
    (Server as any).mockImplementation(() => mockServerInstance);

    // Mock Jules Client
    mockJulesClient = {
      session: vi.fn(),
    };

    // Initialize Server
    server = new JulesMCPServer(mockJulesClient);

    // Extract Handlers
    const listPromptsCalls = mockServerInstance.setRequestHandler.mock.calls.find(
      (call: any) => call[0] === ListPromptsRequestSchema,
    );
    const listToolsCalls = mockServerInstance.setRequestHandler.mock.calls.find(
      (call: any) => call[0] === ListToolsRequestSchema,
    );
    const toolCalls = mockServerInstance.setRequestHandler.mock.calls.find(
      (call: any) => call[0] === CallToolRequestSchema,
    );

    listPromptsHandler = listPromptsCalls ? listPromptsCalls[1] : undefined;
    listToolsHandler = listToolsCalls ? listToolsCalls[1] : undefined;
    callToolHandler = toolCalls ? toolCalls[1] : undefined;
  });

  describe('Initialization', () => {
    it('should register handlers', () => {
      expect(mockServerInstance.setRequestHandler).toHaveBeenCalledWith(
        ListPromptsRequestSchema,
        expect.any(Function),
      );
      expect(mockServerInstance.setRequestHandler).toHaveBeenCalledWith(
        ListToolsRequestSchema,
        expect.any(Function),
      );
      expect(mockServerInstance.setRequestHandler).toHaveBeenCalledWith(
        CallToolRequestSchema,
        expect.any(Function),
      );
    });
  });

  describe('ListPrompts', () => {
    it('should list analyze_session prompt', async () => {
      const result = await listPromptsHandler();
      expect(result.prompts).toHaveLength(1);
      expect(result.prompts[0].name).toBe('analyze_session');
      expect(result.prompts[0].arguments).toEqual([
        {
          name: 'sessionId',
          description: 'The Session ID to analyze',
          required: true,
        },
      ]);
    });
  });

  describe('ListTools', () => {
    it('should list available tools', async () => {
      const result = await listToolsHandler();
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      // Check that some expected tools exist
      const toolNames = result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('get_session_state');
      expect(toolNames).toContain('get_bash_outputs');
      expect(toolNames).toContain('query_cache');
    });
  });

  describe('CallTool', () => {
    it('should return error for unknown tool', async () => {
      await expect(
        callToolHandler({
          params: {
            name: 'unknown_tool',
            arguments: {},
          },
        }),
      ).rejects.toThrow('Tool not found: unknown_tool');
    });
  });
});
