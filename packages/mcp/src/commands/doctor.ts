import chalk from 'chalk';
import dns from 'dns/promises';
import { resolveApiKey } from '../config.js';
import { jules } from '@google/jules-sdk';

export async function doctorAction() {
  console.log(chalk.bold('Jules MCP Doctor\n'));

  const checks = [
    {
      name: 'Node.js Version',
      check: async () => {
        const version = process.version;
        const major = parseInt(version.replace('v', '').split('.')[0], 10);
        if (major < 18) {
          throw new Error(
            `Node.js version ${version} is too old. Please upgrade to v18+.`,
          );
        }
        return `v${major} (${version})`;
      },
    },
    {
      name: 'Internet Connectivity',
      check: async () => {
        try {
          await dns.lookup('api.jules.ai');
          return 'Connected';
        } catch {
          // Fallback to google if our api domain isn't public/resolvable yet
          await dns.lookup('google.com');
          return 'Connected (via fallback)';
        }
      },
    },
    {
      name: 'API Key Configuration',
      check: async () => {
        const apiKey = resolveApiKey();
        if (!apiKey) {
          throw new Error(
            'JULES_API_KEY is missing. Run `jules-mcp config` or set JULES_API_KEY env var.',
          );
        }
        return 'Present';
      },
    },
    {
      name: 'API Connection',
      check: async () => {
        const apiKey = resolveApiKey();
        if (!apiKey) throw new Error('Skipped (No API Key)');

        const client = jules.with({ apiKey });
        // Lightweight check: listing sessions with limit 1
        // client.sessions() returns a SessionCursor which is thenable (Promise-like)
        // resolving to the first page of results.
        await client.sessions({ limit: 1 });
        return 'Authenticated';
      },
    },
  ];

  let hasError = false;

  for (const { name, check } of checks) {
    process.stdout.write(`${name}: `);
    try {
      const result = await check();
      console.log(chalk.green(`✓ ${result}`));
    } catch (error: any) {
      hasError = true;
      console.log(chalk.red(`✗ Failed`));
      console.log(chalk.dim(`  ${error.message || error}`));
    }
  }

  console.log();
  if (hasError) {
    console.log(
      chalk.red('Doctor found issues. Please resolve them before proceeding.'),
    );
    process.exit(1);
  } else {
    console.log(chalk.green('All checks passed! Your environment is ready.'));
  }
}
