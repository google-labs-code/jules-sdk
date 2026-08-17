import {
  type JulesClient,
  type SessionConfig,
  validateRepository,
  validateBranchName,
} from '@google/jules-sdk';
import type { CreateSessionResult, CreateSessionOptions } from './types.js';

/**
 * Create a new Jules session or automated run.
 *
 * @param client - The Jules client instance
 * @param options - Session configuration options
 * @returns The created session ID
 */
export async function createSession(
  client: JulesClient,
  options: CreateSessionOptions,
): Promise<CreateSessionResult> {
  // Validate inputs at the MCP function boundary (defense-in-depth)
  if (options.repo) {
    validateRepository(options.repo);
  }
  if (options.branch) {
    validateBranchName(options.branch);
  }

  // Build config - source is optional for repoless sessions
  const config: SessionConfig = {
    prompt: options.prompt,
    title: options.title,
    requireApproval: options.interactive,
    autoPr: options.autoPr !== undefined ? options.autoPr : true,
  };

  // Only add source if both repo and branch are provided
  if (options.repo && options.branch) {
    config.source = { github: options.repo, baseBranch: options.branch };
  }

  const result = options.interactive
    ? await client.session(config)
    : await client.run(config);

  return {
    id: result.id,
  };
}
