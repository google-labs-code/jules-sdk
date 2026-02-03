import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSessionState } from '../../src/functions/session-state.js';
import { codeReview } from '../../src/functions/code-review.js';
import { showDiff } from '../../src/functions/show-diff.js';
import {
  createMockClient,
  createMockSnapshot,
  mockSessionWithSnapshot,
} from './helpers.js';

describe('Null Safety & Resilience', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Session with undefined activities (new/empty sessions)', () => {
    it('getSessionState should handle undefined activities gracefully', async () => {
      const snapshot = createMockSnapshot({
        id: 'session-new',
        state: 'queued',
        title: 'New Session'
      });

      const mockSession = {
        snapshot: vi.fn().mockResolvedValue({
          ...snapshot,
          activities: undefined
        }),
        activities: {
          hydrate: vi.fn().mockResolvedValue(0)
        }
      };

      vi.spyOn(mockClient, 'session').mockReturnValue(mockSession as any);

      const result = await getSessionState(mockClient, 'session-new');
      expect(result.status).toBe('busy');
      expect(result.lastActivity).toBeUndefined();
    });

    it('codeReview should return empty files list when activities are undefined', async () => {
       const snapshot = createMockSnapshot({
        id: 'session-new',
        state: 'queued',
        title: 'New Session'
      });

      const mockSession = {
        snapshot: vi.fn().mockResolvedValue({
          ...snapshot,
          activities: undefined
        }),
        activities: {
          hydrate: vi.fn().mockResolvedValue(0)
        }
      };
      vi.spyOn(mockClient, 'session').mockReturnValue(mockSession as any);

      const result = await codeReview(mockClient, 'session-new');
      expect(result.files).toEqual([]);
    });

    it('showDiff should return empty patch when activities are undefined and activityId is provided', async () => {
       const snapshot = createMockSnapshot({
        id: 'session-new',
        state: 'queued',
        title: 'New Session'
      });

      const mockSession = {
        snapshot: vi.fn().mockResolvedValue({
          ...snapshot,
          activities: undefined
        }),
        activities: {
          hydrate: vi.fn().mockResolvedValue(0)
        }
      };
      vi.spyOn(mockClient, 'session').mockReturnValue(mockSession as any);

      const result = await showDiff(mockClient, 'session-new', { activityId: 'non-existent' });
      expect(result.unidiffPatch).toBe('');
    });
  });

  describe('Session with malformed changeSet (raw property vs function)', () => {
    it('codeReview should handle non-function changeSet gracefully', async () => {
      const snapshot = createMockSnapshot({
        id: 'session-stable',
        state: 'completed',
        title: 'Completed Session'
      });

      (snapshot as any).changeSet = { gitPatch: { unidiffPatch: '' } };

      mockSessionWithSnapshot(mockClient, snapshot);

      const result = await codeReview(mockClient, 'session-stable');
      expect(result.files).toEqual([]);
    });

    it('showDiff should handle non-function changeSet gracefully', async () => {
       const snapshot = createMockSnapshot({
        id: 'session-stable',
        state: 'completed',
        title: 'Completed Session'
      });

      (snapshot as any).changeSet = { gitPatch: { unidiffPatch: '' } };

      mockSessionWithSnapshot(mockClient, snapshot);

      const result = await showDiff(mockClient, 'session-stable');
      expect(result.unidiffPatch).toBe('');
    });
  });
});
