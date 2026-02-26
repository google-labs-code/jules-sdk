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
import { SessionCheckInputSchema } from '../conflicts/session-spec.js';
import { SessionCheckHandler } from '../conflicts/session-handler.js';
import { GitCheckInputSchema } from '../conflicts/git-spec.js';
import { GitCheckHandler } from '../conflicts/git-handler.js';
import { createOctokit } from '../shared/github.js';
import { createJulesClient } from '../shared/session.js';

export function createMergeServer(): McpServer {
  const server = new McpServer({
    name: 'jules-merge',
    version: '0.0.1',
  });

  server.tool(
    'check_conflicts',
    'Check for merge conflicts. Provide sessionId for proactive checks against remote, or pullRequestNumber + failingCommitSha for CI failure diagnosis.',
    {
      // Common
      repo: z.string().describe('Repository in owner/repo format'),
      // Session mode (proactive)
      sessionId: z
        .string()
        .optional()
        .describe('Jules session ID — triggers proactive session mode'),
      base: z
        .string()
        .default('main')
        .describe('Base branch name (session mode only)'),
      // Git mode (CI failure)
      pullRequestNumber: z
        .number()
        .optional()
        .describe('Pull request number — triggers CI failure mode'),
      failingCommitSha: z
        .string()
        .optional()
        .describe('Failing commit SHA (CI failure mode only)'),
    },
    async ({ repo, sessionId, base, pullRequestNumber, failingCommitSha }) => {
      let result: any;

      if (sessionId) {
        const input = SessionCheckInputSchema.parse({ sessionId, repo, base });
        const handler = new SessionCheckHandler(createOctokit(), createJulesClient);
        result = await handler.execute(input);
      } else if (pullRequestNumber && failingCommitSha) {
        const input = GitCheckInputSchema.parse({
          repo,
          pullRequestNumber,
          failingCommitSha,
        });
        const handler = new GitCheckHandler();
        result = await handler.execute(input);
      } else {
        result = {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message:
              'Provide sessionId for proactive checks, or pullRequestNumber + failingCommitSha for CI failure diagnosis.',
            recoverable: false,
          },
        };
      }

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
