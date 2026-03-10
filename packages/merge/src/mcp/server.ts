// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createMergeOctokit } from '../shared/auth.js';
import { scanHandler } from '../reconcile/scan-handler.js';
import { getContentsHandler } from '../reconcile/get-contents-handler.js';
import { stageResolutionHandler } from '../reconcile/stage-resolution-handler.js';
import { statusHandler } from '../reconcile/status-handler.js';
import { pushHandler } from '../reconcile/push-handler.js';
import { mergeHandler } from '../reconcile/merge-handler.js';
import { schemaHandler } from '../reconcile/schema-handler.js';

export function createMergeServer(): McpServer {
  const server = new McpServer({
    name: 'jules-merge',
    version: '0.0.3',
  });

  server.tool(
    'scan_fleet',
    'Scan fleet PRs for overlapping file changes and build the reconciliation manifest',
    {
      prs: z.array(z.number()).describe('PR numbers to scan'),
      repo: z.string().describe('Repository in owner/repo format'),
      base: z.string().default('main').describe('Base branch name'),
    },
    async ({ prs, repo, base }) => {
      const octokit = createMergeOctokit();
      const result = await scanHandler(octokit, { prs, repo, base });
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'get_file_contents',
    'Fetch file contents from main, base, or a specific PR head',
    {
      filePath: z.string().describe('File path within the repo'),
      source: z
        .string()
        .describe('Content source: "base", "main", or "pr:<N>"'),
      repo: z.string().describe('Repository in owner/repo format'),
      baseSha: z
        .string()
        .optional()
        .describe('Explicit base SHA (used with source=base)'),
    },
    async ({ filePath, source, repo, baseSha }) => {
      const octokit = createMergeOctokit();
      const result = await getContentsHandler(octokit, {
        filePath,
        source,
        repo,
        baseSha,
      });
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'stage_resolution',
    'Record resolved file content in the reconciliation manifest',
    {
      filePath: z.string().describe('File path within the repo'),
      parents: z
        .array(z.string())
        .describe('Parent sources: ["main", "10", "11"]'),
      content: z
        .string()
        .optional()
        .describe('Inline resolved content'),
      fromFile: z
        .string()
        .optional()
        .describe('Local file path containing the resolved content'),
      note: z.string().optional().describe('Optional resolution note'),
      dryRun: z
        .boolean()
        .optional()
        .describe('Validate without writing to the manifest'),
    },
    async (args) => {
      const result = await stageResolutionHandler(args);
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'get_status',
    'Get current reconciliation status — shows pending, resolved, and clean files',
    {},
    async () => {
      const result = await statusHandler({});
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'push_reconciliation',
    'Create the multi-parent reconciliation commit and PR via Git Data API',
    {
      branch: z
        .string()
        .describe('Branch name for the reconciliation PR'),
      message: z.string().describe('Commit message'),
      repo: z.string().describe('Repository in owner/repo format'),
      dryRun: z
        .boolean()
        .optional()
        .describe('Validate without pushing'),
      mergeStrategy: z
        .enum(['sequential', 'octopus'])
        .optional()
        .describe('"sequential" (default) or "octopus"'),
      prTitle: z.string().optional().describe('Custom PR title'),
      prBody: z.string().optional().describe('Custom PR body'),
    },
    async (args) => {
      const octokit = createMergeOctokit();
      const result = await pushHandler(octokit, args);
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'merge_reconciliation',
    'Merge the reconciliation PR using a merge commit. Always uses merge strategy — never squash or rebase — to preserve the ancestry chain that auto-closes fleet PRs.',
    {
      pr: z.number().describe('PR number to merge'),
      repo: z.string().describe('Repository in owner/repo format'),
    },
    async ({ pr, repo }) => {
      const octokit = createMergeOctokit();
      const result = await mergeHandler(octokit, { pr, repo });
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'get_schema',
    'Get JSON schemas for command inputs/outputs',
    {
      command: z
        .string()
        .optional()
        .describe(
          'Command name: scan, get-contents, stage-resolution, status, push, merge',
        ),
      all: z
        .boolean()
        .optional()
        .describe('Return all schemas at once'),
    },
    async ({ command, all }) => {
      const result = schemaHandler(command, { all });
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  return server;
}

// Start server if run directly
const isMain = process.argv[1]?.endsWith('server.mjs');
if (isMain) {
  const server = createMergeServer();
  const transport = new StdioServerTransport();
  server.connect(transport);
}
