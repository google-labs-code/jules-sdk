import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { createSession } from '../../src/functions/create-session.js';
import { createMockClient } from './helpers.js';
import type { SessionConfig } from '@google/jules-sdk';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('createSession', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let capturedConfig: SessionConfig;

  beforeEach(() => {
    // Default: git detection fails → repoless behaviour preserved
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

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

  it('omits source when only repo is provided and branch cannot be detected', async () => {
    await createSession(mockClient, {
      prompt: 'Fix the bug',
      repo: 'owner/repo',
    });

    expect(capturedConfig.source).toBeUndefined();
  });

  describe('auto-detection', () => {
    it('detects repo and branch from git when both are omitted', async () => {
      vi.mocked(execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git remote get-url origin')
          return 'https://github.com/owner/detected-repo.git';
        if (cmd === 'git branch --show-current') return 'feature-branch';
        throw new Error(`unexpected command: ${cmd}`);
      });

      await createSession(mockClient, { prompt: 'Fix the bug' });

      expect(capturedConfig.source).toEqual({
        github: 'owner/detected-repo',
        baseBranch: 'feature-branch',
      });
    });

    it('explicit repo and branch are used without calling git detection', async () => {
      await createSession(mockClient, {
        prompt: 'Fix the bug',
        repo: 'explicit/repo',
        branch: 'explicit-branch',
      });

      expect(execSync).not.toHaveBeenCalled();
      expect(capturedConfig.source).toEqual({
        github: 'explicit/repo',
        baseBranch: 'explicit-branch',
      });
    });

    it('falls back to repoless when remote URL is not a GitHub URL', async () => {
      vi.mocked(execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git remote get-url origin')
          return 'git@gitlab.com:owner/repo.git';
        if (cmd === 'git branch --show-current') return 'main';
        throw new Error(`unexpected command: ${cmd}`);
      });

      await createSession(mockClient, { prompt: 'Fix the bug' });

      expect(capturedConfig.source).toBeUndefined();
    });

    it('falls back to repoless when git remote throws', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('not a git repository');
      });

      await createSession(mockClient, { prompt: 'Fix the bug' });

      expect(capturedConfig.source).toBeUndefined();
    });

    it('falls back to repoless when git branch returns empty string', async () => {
      vi.mocked(execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git remote get-url origin')
          return 'https://github.com/owner/repo.git';
        if (cmd === 'git branch --show-current') return '';
        throw new Error(`unexpected command: ${cmd}`);
      });

      await createSession(mockClient, { prompt: 'Fix the bug' });

      expect(capturedConfig.source).toBeUndefined();
    });

    it('falls back to repoless when git branch throws', async () => {
      vi.mocked(execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git remote get-url origin')
          return 'https://github.com/owner/repo.git';
        throw new Error('git branch failed');
      });

      await createSession(mockClient, { prompt: 'Fix the bug' });

      expect(capturedConfig.source).toBeUndefined();
    });

    it('uses detected branch when repo is explicit but branch is absent', async () => {
      vi.mocked(execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git branch --show-current') return 'detected-branch';
        throw new Error(`unexpected command: ${cmd}`);
      });

      await createSession(mockClient, {
        prompt: 'Fix the bug',
        repo: 'explicit/repo',
      });

      expect(capturedConfig.source).toEqual({
        github: 'explicit/repo',
        baseBranch: 'detected-branch',
      });
    });

    it('uses detected repo when branch is explicit but repo is absent', async () => {
      vi.mocked(execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git remote get-url origin')
          return 'git@github.com:detected/repo.git';
        throw new Error(`unexpected command: ${cmd}`);
      });

      await createSession(mockClient, {
        prompt: 'Fix the bug',
        branch: 'explicit-branch',
      });

      expect(capturedConfig.source).toEqual({
        github: 'detected/repo',
        baseBranch: 'explicit-branch',
      });
    });
  });
});
