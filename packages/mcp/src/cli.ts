#!/usr/bin/env node
import { Command } from 'commander';
import { JulesMCPServer } from './server/index.js';
import { resolveApiKey } from './config.js';
import { jules } from '@google/jules-sdk';
import { doctorAction } from './commands/doctor.js';
import { configAction } from './commands/config.js';
import packageJson from '../package.json' with { type: 'json' };

const program = new Command();

program
  .name('jules-mcp')
  .description('Jules MCP Server CLI')
  .version(packageJson.version);

program.action(async () => {
  const apiKey = resolveApiKey();
  const client = apiKey ? jules.with({ apiKey }) : jules;

  const server = new JulesMCPServer(client);
  server.run().catch((err) => {
    console.error('Fatal MCP Server Error:', err);
    process.exit(1);
  });
});

program
  .command('doctor')
  .description('Check environment and configuration health')
  .action(doctorAction);

program
  .command('config')
  .description('Configure the Jules API Key')
  .option('-k, --key <api-key>', 'API key to save (skips interactive prompt)')
  .action(configAction);

program.parse(process.argv);
