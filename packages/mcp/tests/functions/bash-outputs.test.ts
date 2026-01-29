import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBashOutputs } from '../../src/functions/bash-outputs.js';
import {
  createMockClient,
  createTestActivity,
  mockSessionWithActivities,
} from './helpers.js';

describe('getBashOutputs', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty outputs for session with no bash artifacts', async () => {
    mockSessionWithActivities(mockClient, []);

    const result = await getBashOutputs(mockClient, 'session-empty');

    expect(result.sessionId).toBe('session-empty');
    expect(result.outputs).toHaveLength(0);
    expect(result.summary).toEqual({
      totalCommands: 0,
      succeeded: 0,
      failed: 0,
    });
  });

  it('returns single successful bash command', async () => {
    const activities = [
      createTestActivity({
        id: 'act-1',
        type: 'progressUpdated',
        artifacts: [
          {
            type: 'bashOutput',
            command: 'echo "hello"',
            stdout: 'hello',
            stderr: '',
            exitCode: 0,
          },
        ],
      }),
    ];
    mockSessionWithActivities(mockClient, activities);

    const result = await getBashOutputs(mockClient, 'session-bash-success');

    expect(result.sessionId).toBe('session-bash-success');
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0].command).toBe('echo "hello"');
    expect(result.outputs[0].stdout).toBe('hello');
    expect(result.outputs[0].exitCode).toBe(0);
    expect(result.summary).toEqual({
      totalCommands: 1,
      succeeded: 1,
      failed: 0,
    });
  });

  it('returns single failed bash command', async () => {
    const activities = [
      createTestActivity({
        id: 'act-1',
        type: 'progressUpdated',
        artifacts: [
          {
            type: 'bashOutput',
            command: 'cat nonexistent.txt',
            stdout: '',
            stderr: 'No such file or directory',
            exitCode: 1,
          },
        ],
      }),
    ];
    mockSessionWithActivities(mockClient, activities);

    const result = await getBashOutputs(mockClient, 'session-bash-failed');

    expect(result.sessionId).toBe('session-bash-failed');
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0].command).toBe('cat nonexistent.txt');
    expect(result.outputs[0].exitCode).toBe(1);
    expect(result.summary).toEqual({
      totalCommands: 1,
      succeeded: 0,
      failed: 1,
    });
  });

  it('throws on missing sessionId', async () => {
    await expect(getBashOutputs(mockClient, '')).rejects.toThrow(
      'sessionId is required',
    );
  });
});
