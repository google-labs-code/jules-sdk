/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DefaultActivityClient,
  NetworkClient,
} from '../../src/activities/client.js';
import { ActivityStorage } from '../../src/storage/types.js';
import { ActivityAgentMessaged } from '../../src/types.js';

// Generate recent ISO dates to avoid triggering frozen session detection (> 30 days)
const recentDate = (minutesAgo: number): string => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - minutesAgo);
  return date.toISOString();
};

// Helper to create dummy activities
const createActivity = (
  id: string,
  createTime: string,
  type: string = 'agentMessaged',
): ActivityAgentMessaged =>
  ({
    name: `sessions/s1/activities/${id}`,
    id,
    type,
    message: `Message ${id}`,
    createTime,
    originator: 'agent',
    artifacts: [],
  }) as ActivityAgentMessaged;

describe('DefaultActivityClient', () => {
  let storageMock: ActivityStorage;
  let networkMock: NetworkClient;
  let client: DefaultActivityClient;

  beforeEach(() => {
    storageMock = {
      init: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      append: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(undefined),
      latest: vi.fn().mockResolvedValue(undefined),
      scan: vi.fn().mockImplementation(async function* () {
        yield* [];
      }),
    };
    networkMock = {
      rawStream: vi.fn().mockImplementation(async function* () {
        yield* [];
      }),
      listActivities: vi.fn().mockResolvedValue({ activities: [] }),
      fetchActivity: vi.fn().mockResolvedValue(undefined),
    };
    client = new DefaultActivityClient(storageMock, networkMock);
  });

  describe('history()', () => {
    it('should hydrate from network then yield all activities from storage', async () => {
      const mockActivities = [
        createActivity('a1', recentDate(10)),
        createActivity('a2', recentDate(5)),
      ];

      storageMock.scan = vi.fn().mockImplementation(async function* () {
        yield* mockActivities;
      });
      // Mock latest() to return the most recent activity (high-water mark)
      storageMock.latest = vi.fn().mockResolvedValue(mockActivities[1]);
      // Network returns empty (no new activities newer than high-water mark)
      networkMock.listActivities = vi
        .fn()
        .mockResolvedValue({ activities: [] });

      const result = [];
      for await (const activity of client.history()) {
        result.push(activity);
      }

      // hydrate() calls init() and latest() (not scan) for high-water mark
      // Then history() calls scan() to yield activities
      expect(storageMock.init).toHaveBeenCalledTimes(1);
      expect(storageMock.latest).toHaveBeenCalled();
      expect(storageMock.scan).toHaveBeenCalledTimes(1); // Only to yield
      expect(networkMock.listActivities).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockActivities);
    });

    it('should sync new activities from network before yielding', async () => {
      const existingActivity = createActivity('a1', recentDate(10));
      const newActivity = createActivity('a2', recentDate(5));

      // Storage has existing activity, scan will yield both after append
      const stored = [existingActivity];
      storageMock.scan = vi.fn().mockImplementation(async function* () {
        yield* stored;
      });
      storageMock.latest = vi.fn().mockResolvedValue(existingActivity);
      storageMock.append = vi.fn().mockImplementation(async (act) => {
        stored.push(act);
      });
      // Mock get() to return existing activity (for boundary timestamp check)
      storageMock.get = vi.fn().mockImplementation(async (id: string) => {
        return stored.find((a) => a.id === id);
      });
      // Network returns both, but hydrate will skip existing (at high-water mark)
      // and append only the new one (newer than high-water mark)
      networkMock.listActivities = vi
        .fn()
        .mockResolvedValue({ activities: [existingActivity, newActivity] });

      const result = [];
      for await (const activity of client.history()) {
        result.push(activity);
      }

      expect(storageMock.append).toHaveBeenCalledWith(newActivity);
      expect(result).toEqual([existingActivity, newActivity]);
    });
  });

  describe('updates()', () => {
    it('should yield new activities and persist them to storage', async () => {
      const newActivity = createActivity('a1', recentDate(5));
      networkMock.rawStream = vi.fn().mockImplementation(async function* () {
        yield newActivity;
      });

      // No previous activities
      storageMock.latest = vi.fn().mockResolvedValue(undefined);

      const result = [];
      for await (const activity of client.updates()) {
        result.push(activity);
      }

      expect(storageMock.init).toHaveBeenCalledTimes(1);
      expect(storageMock.latest).toHaveBeenCalledTimes(1);
      expect(storageMock.append).toHaveBeenCalledWith(newActivity);
      expect(result).toEqual([newActivity]);
    });

    it('should filter out activities older than high-water mark', async () => {
      const oldActivity = createActivity('a1', recentDate(15));
      const latestStored = createActivity('a2', recentDate(10));
      const newActivity = createActivity('a3', recentDate(5));

      storageMock.latest = vi.fn().mockResolvedValue(latestStored);
      networkMock.rawStream = vi.fn().mockImplementation(async function* () {
        yield oldActivity;
        yield latestStored; // Should also be filtered out by ID check if times match exactly
        yield newActivity;
      });

      const result = [];
      for await (const activity of client.updates()) {
        result.push(activity);
      }

      expect(result).toEqual([newActivity]);
      expect(storageMock.append).toHaveBeenCalledTimes(1);
      expect(storageMock.append).toHaveBeenCalledWith(newActivity);
    });

    it('should deduplicate activities with same timestamp AND id as high-water mark', async () => {
      const sameTime = recentDate(10);
      const latestStored = createActivity('a1', sameTime);
      // Same time, different ID -> should be yielded
      const sameTimeDiffId = createActivity('a2', sameTime);

      storageMock.latest = vi.fn().mockResolvedValue(latestStored);
      networkMock.rawStream = vi.fn().mockImplementation(async function* () {
        yield latestStored; // Should be skipped
        yield sameTimeDiffId; // Should be yielded
      });

      const result = [];
      for await (const activity of client.updates()) {
        result.push(activity);
      }

      expect(result).toEqual([sameTimeDiffId]);
      expect(storageMock.append).toHaveBeenCalledWith(sameTimeDiffId);
    });
  });

  describe('stream()', () => {
    it('should yield history then updates', async () => {
      const historyActivity = createActivity('a1', recentDate(10));
      const updateActivity = createActivity('a2', recentDate(5));

      storageMock.scan = vi.fn().mockImplementation(async function* () {
        yield historyActivity;
      });
      // latest() called by hydrate() and updates() to set high-water mark
      storageMock.latest = vi.fn().mockResolvedValue(historyActivity);
      // Network returns empty for hydrate (no new activities)
      networkMock.listActivities = vi
        .fn()
        .mockResolvedValue({ activities: [] });

      networkMock.rawStream = vi.fn().mockImplementation(async function* () {
        // raw stream might yield everything again, updates() should filter
        yield historyActivity;
        yield updateActivity;
      });

      const result = [];
      for await (const activity of client.stream()) {
        result.push(activity);
      }

      expect(result).toEqual([historyActivity, updateActivity]);
      // scan() called once: in history() to yield (hydrate uses latest(), not scan())
      expect(storageMock.scan).toHaveBeenCalledTimes(1);
      // latest() called by hydrate() and updates() to set high-water mark
      expect(storageMock.latest).toHaveBeenCalled();
    });
  });

  describe('select()', () => {
    const a1 = createActivity('a1', recentDate(20), 'typeA');
    const a2 = createActivity('a2', recentDate(15), 'typeB');
    const a3 = createActivity('a3', recentDate(10), 'typeA');
    const a4 = createActivity('a4', recentDate(5), 'typeC');
    const a5 = createActivity('a5', recentDate(1), 'typeA');

    beforeEach(() => {
      storageMock.scan = vi.fn().mockImplementation(async function* () {
        yield a1;
        yield a2;
        yield a3;
        yield a4;
        yield a5;
      });
    });

    it('should return all activities if no options provided', async () => {
      const results = await client.select();
      expect(results).toEqual([a1, a2, a3, a4, a5]);
      expect(storageMock.init).toHaveBeenCalledTimes(1);
    });

    it('should filter by type', async () => {
      const results = await client.select({ type: 'typeA' });
      expect(results).toEqual([a1, a3, a5]);
    });

    it('should support "after" cursor (exclusive)', async () => {
      const results = await client.select({ after: 'a2' });
      expect(results).toEqual([a3, a4, a5]);
    });

    it('should support "before" cursor (exclusive)', async () => {
      const results = await client.select({ before: 'a4' });
      expect(results).toEqual([a1, a2, a3]);
    });

    it('should support both "after" and "before" cursors', async () => {
      const results = await client.select({ after: 'a1', before: 'a5' });
      expect(results).toEqual([a2, a3, a4]);
    });

    it('should support limit', async () => {
      const results = await client.select({ limit: 2 });
      expect(results).toEqual([a1, a2]);
    });

    it('should support combined filters (type + after + limit)', async () => {
      const results = await client.select({
        type: 'typeA',
        after: 'a1',
        limit: 1,
      });
      expect(results).toEqual([a3]);
    });

    it('should return empty list if "after" cursor not found', async () => {
      const results = await client.select({ after: 'non-existent' });
      expect(results).toEqual([]);
    });
  });

  describe('list()', () => {
    it('should delegate to network.listActivities', async () => {
      const mockResponse = {
        activities: [createActivity('a1', recentDate(10))],
        nextPageToken: 'token',
      };
      (networkMock.listActivities as any).mockResolvedValue(mockResponse);

      const options = { pageSize: 10, pageToken: 'prev-token' };
      const result = await client.list(options);

      expect(networkMock.listActivities).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('get()', () => {
    it('should return from storage if found (cache hit)', async () => {
      const cachedActivity = createActivity('a1', recentDate(10));
      storageMock.get = vi.fn().mockResolvedValue(cachedActivity);

      const result = await client.get('a1');

      expect(storageMock.init).toHaveBeenCalledTimes(1);
      expect(storageMock.get).toHaveBeenCalledWith('a1');
      expect(networkMock.fetchActivity).not.toHaveBeenCalled();
      expect(result).toEqual(cachedActivity);
    });

    it('should fetch from network, persist, and return if not in storage (cache miss)', async () => {
      const freshActivity = createActivity('a1', recentDate(10));
      storageMock.get = vi.fn().mockResolvedValue(undefined);
      (networkMock.fetchActivity as any).mockResolvedValue(freshActivity);

      const result = await client.get('a1');

      expect(storageMock.init).toHaveBeenCalledTimes(1);
      expect(storageMock.get).toHaveBeenCalledWith('a1');
      expect(networkMock.fetchActivity).toHaveBeenCalledWith('a1');
      expect(storageMock.append).toHaveBeenCalledWith(freshActivity);
      expect(result).toEqual(freshActivity);
    });
  });
});
