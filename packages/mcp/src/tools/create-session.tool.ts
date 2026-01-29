import type { JulesClient } from '@google/jules-sdk';
import { createSession } from '../functions/create-session.js';
import { defineTool, toMcpResponse } from './utils.js';

export default defineTool({
  name: 'create_session',
  description:
    'Creates a new Jules session or automated run to perform code tasks. If repo and branch are omitted, creates a "repoless" session where the user provides their own context in the prompt and Jules will perform code tasks based on that context instead of a GitHub repo.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The task for the agent.',
      },
      repo: {
        type: 'string',
        description:
          'GitHub repository (owner/repo). Optional for repoless sessions.',
      },
      branch: {
        type: 'string',
        description: 'Target branch. Optional for repoless sessions.',
      },
      interactive: {
        type: 'boolean',
        description:
          'If true, waits for plan approval. Defaults to false (automated run).',
      },
      autoPr: {
        type: 'boolean',
        description:
          'Automatically create a PR on completion. Defaults to true.',
      },
    },
    required: ['prompt'],
  },
  handler: async (client: JulesClient, args: any) => {
    const result = await createSession(client, {
      prompt: args.prompt,
      repo: args.repo,
      branch: args.branch,
      interactive: args.interactive,
      autoPr: args.autoPr,
    });
    return toMcpResponse(`Session created. ID: ${result.id}`);
  },
});
