import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    minify: false,
    sourcemap: true,
    lib: {
      entry: {
        index: 'src/index.ts',
        cli: 'src/cli.ts',
        tools: 'src/tools.ts',
      },
      name: 'jules-mcp',
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.mjs`,
    },
    rollupOptions: {
      external: [
        // Workspace dependency
        '@google/jules-sdk',

        // Peer dependencies
        '@modelcontextprotocol/sdk',
        '@modelcontextprotocol/sdk/server/index.js',
        '@modelcontextprotocol/sdk/server/stdio.js',
        '@modelcontextprotocol/sdk/client/index.js',
        '@modelcontextprotocol/sdk/client/streamableHttp.js',
        '@modelcontextprotocol/sdk/types.js',
        '@inquirer/prompts',
        'chalk',
        'commander',

        // Node.js Built-ins
        'node:buffer',
        'node:crypto',
        'node:dns/promises',
        'node:fs',
        'node:fs/promises',
        'node:path',
        'node:process',
        'node:os',
        'node:url',
        'buffer',
        'crypto',
        'dns/promises',
        'fs',
        'fs/promises',
        'path',
        'process',
        'os',
        'url',
      ],
    },
  },
  plugins: [dts()],
});
