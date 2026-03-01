import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSession } from '../../src/functions/create-session.js';
import { createMockClient } from './helpers.js';
import type { SessionConfig } from '@google/jules-sdk';

describe('createSession', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let capturedConfig: SessionConfig;

  beforeEach(() => {
    mockClient = createMockClient();
    // Mock both client.run and client.session to capture the config
    vi.spyOn(mockClient, 'run').mockImplementation(async (config) => {
      capturedConfig = config;
      return { id: 'run-session-id' } as any;
    });
    // The top-level client.session(config) overload for creating sessions
    const originalSession = mockClient.session.bind(mockClient);
    vi.spyOn(mockClient, 'session').mockImplementation(((configOrId: any) => {
      if (typeof configOrId === 'object' && 'prompt' in configOrId) {
        capturedConfig = configOrId as SessionConfig;
        return Promise.resolve({ id: 'interactive-session-id' }) as any;
      }
      return originalSession(configOrId);
    }) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes title through to SDK config on automated run', async () => {
    const result = await createSession(mockClient, {
      prompt: 'Fix the bug',
      title: 'Bug Fix Session',
    });

    expect(result.id).toBe('run-session-id');
    expect(capturedConfig.title).toBe('Bug Fix Session');
    expect(capturedConfig.prompt).toBe('Fix the bug');
  });

  it('passes title through to SDK config on interactive session', async () => {
    const result = await createSession(mockClient, {
      prompt: 'Fix the bug',
      title: 'Interactive Bug Fix',
      interactive: true,
    });

    expect(result.id).toBe('interactive-session-id');
    expect(capturedConfig.title).toBe('Interactive Bug Fix');
  });

  it('leaves title undefined when not provided', async () => {
    await createSession(mockClient, {
      prompt: 'Fix the bug',
    });

    expect(capturedConfig.title).toBeUndefined();
  });

  it('creates automated run by default', async () => {
    await createSession(mockClient, {
      prompt: 'Fix the bug',
    });

    expect(mockClient.run).toHaveBeenCalled();
  });

  it('creates interactive session when interactive is true', async () => {
    await createSession(mockClient, {
      prompt: 'Fix the bug',
      interactive: true,
    });

    expect(mockClient.session).toHaveBeenCalled();
  });

  it('defaults autoPr to true', async () => {
    await createSession(mockClient, {
      prompt: 'Fix the bug',
    });

    expect(capturedConfig.autoPr).toBe(true);
  });

  it('respects autoPr when explicitly set to false', async () => {
    await createSession(mockClient, {
      prompt: 'Fix the bug',
      autoPr: false,
    });

    expect(capturedConfig.autoPr).toBe(false);
  });

  it('adds source when repo and branch are provided', async () => {
    await createSession(mockClient, {
      prompt: 'Fix the bug',
      repo: 'owner/repo',
      branch: 'main',
    });

    expect(capturedConfig.source).toEqual({
      github: 'owner/repo',
      baseBranch: 'main',
    });
  });

  it('omits source when only repo is provided', async () => {
    await createSession(mockClient, {
      prompt: 'Fix the bug',
      repo: 'owner/repo',
    });

    expect(capturedConfig.source).toBeUndefined();
  });
});
