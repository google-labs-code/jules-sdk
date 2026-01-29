import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSessionState } from '../../src/functions/session-state.js';
import {
  createMockClient,
  createMockSnapshot,
  mockSessionWithSnapshot,
} from './helpers.js';

describe('getSessionState', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns basic session info', async () => {
    const snapshot = createMockSnapshot({
      id: 'session-123',
      state: 'inProgress',
      url: 'http://example.com/session-123',
      title: 'Test Session',
    });
    mockSessionWithSnapshot(mockClient, snapshot);

    const result = await getSessionState(mockClient, 'session-123');

    expect(result.id).toBe('session-123');
    expect(result.state).toBe('inProgress');
    expect(result.status).toBe('busy');
    expect(result.url).toBe('http://example.com/session-123');
    expect(result.title).toBe('Test Session');
  });

  it('includes PR info when available', async () => {
    const snapshot = createMockSnapshot({
      id: 'session-123',
      state: 'completed',
      url: 'http://example.com/session-123',
      title: 'Test Session with PR',
      pr: {
        url: 'http://github.com/pr/1',
        title: 'Feat: New feature',
      },
    });
    mockSessionWithSnapshot(mockClient, snapshot);

    const result = await getSessionState(mockClient, 'session-123');

    expect(result.state).toBe('completed');
    expect(result.status).toBe('stable');
    expect(result.pr).toEqual({
      url: 'http://github.com/pr/1',
      title: 'Feat: New feature',
    });
  });

  it('throws on missing sessionId', async () => {
    await expect(getSessionState(mockClient, '')).rejects.toThrow(
      'sessionId is required',
    );
  });

  it('returns busy status for queued state', async () => {
    const snapshot = createMockSnapshot({
      id: 'session-123',
      state: 'queued',
      url: 'http://example.com/session-123',
      title: 'Queued Session',
    });
    mockSessionWithSnapshot(mockClient, snapshot);

    const result = await getSessionState(mockClient, 'session-123');
    expect(result.status).toBe('busy');
  });

  it('returns failed status for failed state', async () => {
    const snapshot = createMockSnapshot({
      id: 'session-123',
      state: 'failed',
      url: 'http://example.com/session-123',
      title: 'Failed Session',
    });
    mockSessionWithSnapshot(mockClient, snapshot);

    const result = await getSessionState(mockClient, 'session-123');
    expect(result.status).toBe('failed');
  });
});
