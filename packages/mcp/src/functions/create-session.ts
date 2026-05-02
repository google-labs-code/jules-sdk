import { execSync } from 'node:child_process';
import type { JulesClient, SessionConfig } from '@google/jules-sdk';
import type { CreateSessionResult, CreateSessionOptions } from './types.js';

function detectGitRepo(): string | undefined {
  try {
    const url = execSync('git remote get-url origin', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
    return match?.[1] ?? undefined;
  } catch {
    return undefined;
  }
}

function detectGitBranch(): string | undefined {
  try {
    const branch = execSync('git branch --show-current', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return branch || undefined;
  } catch {
    return undefined;
  }
}

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
  const repo = options.repo ?? detectGitRepo();
  const branch = options.branch ?? detectGitBranch();

  // Build config - source is optional for repoless sessions
  const config: SessionConfig = {
    prompt: options.prompt,
    title: options.title,
    requireApproval: options.interactive,
    autoPr: options.autoPr !== undefined ? options.autoPr : true,
  };

  if (repo && branch) {
    config.source = { github: repo, baseBranch: branch };
  }

  const result = options.interactive
    ? await client.session(config)
    : await client.run(config);

  return {
    id: result.id,
  };
}
