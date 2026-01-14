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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkAdapter } from '../../src/network/adapter.js';
import { ApiClient } from '../../src/api.js';

// Mock ApiClient
const mockRequest = vi.fn();
vi.mock('../../src/api.js', () => {
  return {
    ApiClient: vi.fn().mockImplementation(() => {
      return {
        request: mockRequest,
      };
    }),
  };
});

function createMockRestActivity(id: string) {
  return {
    name: `sessions/session-123/activities/${id}`,
    createTime: '2023-01-01T00:00:00Z',
    originator: 'system',
    sessionCompleted: {},
  };
}

function createExpectedSdkActivity(id: string) {
  return {
    name: `sessions/session-123/activities/${id}`,
    id: id,
    createTime: '2023-01-01T00:00:00Z',
    originator: 'system',
    artifacts: [],
    type: 'sessionCompleted',
  };
}

import { mockPlatform } from '../mocks/platform.js';

describe('NetworkAdapter', () => {
  let adapter: NetworkAdapter;
  let apiClient: ApiClient;

  beforeEach(() => {
    mockRequest.mockReset();
    apiClient = new ApiClient({
      apiKey: 'test-key',
      baseUrl: 'http://test-url',
      requestTimeoutMs: 1000,
    });
    adapter = new NetworkAdapter(apiClient, 'session-123', 100, mockPlatform); // Short polling interval for tests
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should fetch a single activity', async () => {
    const mockRest = createMockRestActivity('act-1');
    mockRequest.mockResolvedValue(mockRest);

    const result = await adapter.fetchActivity('act-1');

    expect(mockRequest).toHaveBeenCalledWith(
      'sessions/session-123/activities/act-1',
    );
    expect(result).toEqual(createExpectedSdkActivity('act-1'));
  });

  it('should list activities with options', async () => {
    const mockResponse = {
      activities: [
        createMockRestActivity('act-1'),
        createMockRestActivity('act-2'),
      ],
      nextPageToken: 'token-next',
    };
    mockRequest.mockResolvedValue(mockResponse);

    const result = await adapter.listActivities({
      pageSize: 10,
      pageToken: 'token-prev',
    });

    expect(mockRequest).toHaveBeenCalledWith(
      'sessions/session-123/activities',
      {
        query: {
          pageSize: '10',
          pageToken: 'token-prev',
        },
      },
    );
    expect(result).toEqual({
      activities: [
        createExpectedSdkActivity('act-1'),
        createExpectedSdkActivity('act-2'),
      ],
      nextPageToken: 'token-next',
    });
  });

  it('should pass filter parameter', async () => {
    mockRequest.mockResolvedValue({});
    await adapter.listActivities({
      filter: 'create_time>"2023-01-01T00:00:00Z"',
    });

    expect(mockRequest).toHaveBeenCalledWith(
      'sessions/session-123/activities',
      {
        query: {
          filter: 'create_time>"2023-01-01T00:00:00Z"',
        },
      },
    );
  });

  it('should pass both filter and pageToken', async () => {
    mockRequest.mockResolvedValue({});
    await adapter.listActivities({
      filter: 'create_time>"2023-01-01T00:00:00Z"',
      pageToken: 'token-123',
    });

    expect(mockRequest).toHaveBeenCalledWith(
      'sessions/session-123/activities',
      {
        query: {
          filter: 'create_time>"2023-01-01T00:00:00Z"',
          pageToken: 'token-123',
        },
      },
    );
  });

  it('should handle empty list response', async () => {
    mockRequest.mockResolvedValue({});

    const result = await adapter.listActivities();

    expect(result.activities).toEqual([]);
    expect(result.nextPageToken).toBeUndefined();
  });

  it('should poll in rawStream', async () => {
    // Mock first call: returns one activity, no next page
    mockRequest.mockResolvedValueOnce({
      activities: [createMockRestActivity('act-1')],
    });
    // Mock second call (after poll): returns same activity + new one
    mockRequest.mockResolvedValueOnce({
      activities: [
        createMockRestActivity('act-1'),
        createMockRestActivity('act-2'),
      ],
    });

    const stream = adapter.rawStream();
    const iterator = stream[Symbol.asyncIterator]();

    // First fetch
    let next = await iterator.next();
    expect(next.value).toEqual(createExpectedSdkActivity('act-1'));

    // Should be waiting now.
    // We need to trigger the wait.
    const nextPromise = iterator.next();

    // Advance time to trigger polling
    await vi.advanceTimersByTimeAsync(101);

    next = await nextPromise;
    // Re-fetched 'act-1' because it starts from scratch
    expect(next.value).toEqual(createExpectedSdkActivity('act-1'));

    next = await iterator.next();
    // Newly fetched 'act-2'
    expect(next.value).toEqual(createExpectedSdkActivity('act-2'));
  });
});
