#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { runMcpServer } from './src/index.js';

const main = defineCommand({
  meta: {
    name: 'jules-mcp-cli',
    version: '1.0.0',
    description: 'A Custom Jules MCP Server built as a CLI tool using citty and Typed Service Contracts.',
  },
  args: {
    port: {
      type: 'string',
      description: 'Port for alternative transports (currently uses stdio)',
    },
  },
  async run({ args }) {
    await runMcpServer();
  },
});

runMain(main).catch((error) => {
  console.error('Fatal CLI Error:', error);
  process.exit(1);
});

