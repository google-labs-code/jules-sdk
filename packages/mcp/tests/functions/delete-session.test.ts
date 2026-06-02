import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deleteSession } from '../../src/functions/delete-session.js';
import { createMockClient } from './helpers.js';

describe('deleteSession', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes a single session by ID', async () => {
    const mockSession = {
      delete: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(mockClient, 'session').mockReturnValue(mockSession as any);

    const result = await deleteSession(mockClient, { sessionId: 'session-123' });

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(1);
    expect(result.sessionIds).toEqual(['session-123']);
    expect(mockSession.delete).toHaveBeenCalled();
  });

  it('fails when single session deletion fails', async () => {
    const mockSession = {
      delete: vi.fn().mockRejectedValue(new Error('API Error')),
    };
    vi.spyOn(mockClient, 'session').mockReturnValue(mockSession as any);

    const result = await deleteSession(mockClient, { sessionId: 'session-123' });

    expect(result.success).toBe(false);
    expect(result.deletedCount).toBe(0);
    expect(result.message).toContain('Failed to delete session session-123');
  });

  it('deletes multiple sessions with filter and force', async () => {
    const sessions = [
      { id: 's1', state: 'completed' },
      { id: 's2', state: 'failed' },
      { id: 's3', state: 'completed' },
    ];

    vi.spyOn(mockClient, 'sessions').mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        for (const s of sessions) yield s;
      },
    } as any);

    const mockDelete = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(mockClient, 'session').mockReturnValue({
      delete: mockDelete,
    } as any);

    const result = await deleteSession(mockClient, {
      filter: 'completed',
      force: true,
    });

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(2);
    expect(result.sessionIds).toEqual(['s1', 's3']);
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it('requires force for multiple sessions', async () => {
    const sessions = [{ id: 's1', state: 'completed' }];

    vi.spyOn(mockClient, 'sessions').mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        for (const s of sessions) yield s;
      },
    } as any);

    const result = await deleteSession(mockClient, { filter: 'completed' });

    expect(result.success).toBe(false);
    expect(result.requiresForce).toBe(true);
    expect(result.sessionIds).toEqual(['s1']);
  });

  it('handles running filter correctly', async () => {
    const sessions = [
      { id: 's1', state: 'inProgress' },
      { id: 's2', state: 'completed' },
      { id: 's3', state: 'queued' },
    ];

    vi.spyOn(mockClient, 'sessions').mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        for (const s of sessions) yield s;
      },
    } as any);

    const mockDelete = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(mockClient, 'session').mockReturnValue({
      delete: mockDelete,
    } as any);

    const result = await deleteSession(mockClient, {
      filter: 'running',
      force: true,
    });

    expect(result.deletedCount).toBe(2);
    expect(result.sessionIds).toEqual(['s1', 's3']);
  });

  it('returns success when no sessions match filter', async () => {
    vi.spyOn(mockClient, 'sessions').mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        // empty
      },
    } as any);

    const result = await deleteSession(mockClient, { filter: 'completed' });

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(0);
    expect(result.message).toContain('No sessions found matching filter');
  });
});
