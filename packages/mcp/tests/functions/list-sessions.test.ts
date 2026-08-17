import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listSessions } from '../../src/functions/list-sessions.js';
import { createMockClient } from './helpers.js';

describe('listSessions', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows standard page token', async () => {
    const sessionsSpy = vi.spyOn(mockClient, 'sessions').mockReturnValue({
      then: (resolve: any) => resolve({ sessions: [], nextPageToken: undefined }),
    } as any);

    const result = await listSessions(mockClient, {
      pageToken: '1704448500999999000',
    });

    expect(result.sessions).toEqual([]);
    expect(sessionsSpy).toHaveBeenCalledWith({
      pageSize: 10,
      pageToken: '1704448500999999000',
    });
  });

  describe('input validation on pageToken', () => {
    it('throws validation error if pageToken contains traversal', async () => {
      await expect(
        listSessions(mockClient, { pageToken: '..' }),
      ).rejects.toThrow('PATH_TRAVERSAL');
    });

    it('throws validation error if pageToken contains slashes', async () => {
      await expect(
        listSessions(mockClient, { pageToken: 'abc/def' }),
      ).rejects.toThrow('INVALID_PAGE_TOKEN');
    });

    it('throws validation error if pageToken contains control characters', async () => {
      await expect(
        listSessions(mockClient, { pageToken: 'token\x00' }),
      ).rejects.toThrow('CONTROL_CHAR');
    });
  });
});
