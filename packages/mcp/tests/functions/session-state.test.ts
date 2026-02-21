import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSessionState } from '../../src/functions/session-state.js';
import {
  createMockClient,
  createMockSnapshot,
  createTestActivity,
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

  it('includes lastActivity with type and timestamp', async () => {
    const snapshot = createMockSnapshot({
      id: 'session-123',
      state: 'completed',
      url: 'http://example.com/session-123',
      title: 'Session with Activity',
    });
    const activities = [
      createTestActivity({
        id: 'activity-1',
        type: 'sessionCompleted',
        createTime: '2026-01-30T12:00:00Z',
        artifacts: [],
      }),
    ];
    mockSessionWithSnapshot(mockClient, snapshot, activities);

    const result = await getSessionState(mockClient, 'session-123');

    expect(result.lastActivity).toEqual({
      activityId: 'activity-1',
      type: 'sessionCompleted',
      timestamp: '2026-01-30T12:00:00Z',
    });
  });

  it('includes lastAgentMessage when agentMessaged activity exists', async () => {
    const snapshot = createMockSnapshot({
      id: 'session-123',
      state: 'AWAITING_USER_FEEDBACK',
      url: 'http://example.com/session-123',
      title: 'Session with Question',
    });
    const activities = [
      createTestActivity({
        id: 'activity-1',
        type: 'agentMessaged',
        createTime: '2026-01-30T12:00:00Z',
        message: 'Does this align with your expectations?',
        artifacts: [],
      }),
    ];
    mockSessionWithSnapshot(mockClient, snapshot, activities);

    const result = await getSessionState(mockClient, 'session-123');

    expect(result.status).toBe('stable');
    expect(result.lastActivity).toEqual({
      activityId: 'activity-1',
      type: 'agentMessaged',
      timestamp: '2026-01-30T12:00:00Z',
    });
    expect(result.lastAgentMessage).toEqual({
      activityId: 'activity-1',
      content: 'Does this align with your expectations?',
      timestamp: '2026-01-30T12:00:00Z',
    });
  });

  it('returns most recent agentMessaged when multiple exist', async () => {
    const snapshot = createMockSnapshot({
      id: 'session-123',
      state: 'completed',
      url: 'http://example.com/session-123',
      title: 'Session with Multiple Messages',
    });
    const activities = [
      createTestActivity({
        id: 'activity-1',
        type: 'agentMessaged',
        createTime: '2026-01-30T10:00:00Z',
        message: 'First message',
        artifacts: [],
      }),
      createTestActivity({
        id: 'activity-2',
        type: 'agentMessaged',
        createTime: '2026-01-30T12:00:00Z',
        message: 'Latest message - need more info',
        artifacts: [],
      }),
    ];
    mockSessionWithSnapshot(mockClient, snapshot, activities);

    const result = await getSessionState(mockClient, 'session-123');

    expect(result.lastActivity?.activityId).toBe('activity-2');
    expect(result.lastAgentMessage?.activityId).toBe('activity-2');
    expect(result.lastAgentMessage?.content).toBe('Latest message - need more info');
  });

  it('omits lastAgentMessage when no agentMessaged activities', async () => {
    const snapshot = createMockSnapshot({
      id: 'session-123',
      state: 'completed',
      url: 'http://example.com/session-123',
      title: 'Session without Messages',
    });
    const activities = [
      createTestActivity({
        id: 'activity-1',
        type: 'sessionCompleted',
        artifacts: [],
      }),
    ];
    mockSessionWithSnapshot(mockClient, snapshot, activities);

    const result = await getSessionState(mockClient, 'session-123');

    expect(result.lastActivity?.type).toBe('sessionCompleted');
    expect(result.lastAgentMessage).toBeUndefined();
  });
});
