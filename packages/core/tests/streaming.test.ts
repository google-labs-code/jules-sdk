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

// tests/streaming.test.ts
import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { server } from './mocks/server.js';
import { http, HttpResponse } from 'msw';
import { ApiClient } from '../src/api.js';
import { streamActivities } from '../src/streaming.js';
import { Activity } from '../src/types.js';

// Set up the mock server
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const API_KEY = 'test-api-key';
const BASE_URL = 'https://jules.googleapis.com/v1alpha';
const SESSION_ID = 'stream-session-123';
const POLLING_INTERVAL = 1000; // Use a faster interval for tests

import { mockPlatform } from './mocks/platform.js';

describe('streamActivities', () => {
  const apiClient = new ApiClient({
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    requestTimeoutMs: 30000,
  });

  // Use fake timers to control polling
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('should handle fast pagination with nextPageToken', async () => {
    const page1 = {
      activities: [{ name: 'a/1', progressUpdated: { title: 'Page 1' } }],
      nextPageToken: 'tokenA',
    };
    const page2 = {
      activities: [
        { name: 'a/2', progressUpdated: { title: 'Page 2' } },
        { name: 'a/3', sessionCompleted: {} },
      ],
    };

    server.use(
      http.get(
        `${BASE_URL}/sessions/${SESSION_ID}/activities`,
        ({ request }) => {
          const url = new URL(request.url);
          const token = url.searchParams.get('pageToken');
          if (token === 'tokenA') {
            return HttpResponse.json(page2);
          }
          return HttpResponse.json(page1);
        },
      ),
    );

    const stream = streamActivities(
      SESSION_ID,
      apiClient,
      POLLING_INTERVAL,
      mockPlatform,
    );
    const iterator = stream[Symbol.asyncIterator]();

    const result1 = await iterator.next();
    const result2 = await iterator.next();
    const result3 = await iterator.next();
    await iterator.return(undefined); // End the generator

    const activities = [result1.value, result2.value, result3.value];

    expect(activities).toHaveLength(3);
    expect(activities[0].id).toBe('1');
    expect(activities[2].type).toBe('sessionCompleted');
  });

  it('should handle slow polling when no nextPageToken is present', async () => {
    let requestCount = 0;
    const page1 = {
      activities: [{ name: 'a/1', progressUpdated: { title: 'First Batch' } }],
      // No nextPageToken
    };
    const page2 = {
      activities: [{ name: 'a/2', sessionCompleted: {} }],
    };

    server.use(
      http.get(`${BASE_URL}/sessions/${SESSION_ID}/activities`, () => {
        requestCount++;
        if (requestCount > 1) {
          return HttpResponse.json(page2);
        }
        return HttpResponse.json(page1);
      }),
    );

    const stream = streamActivities(
      SESSION_ID,
      apiClient,
      POLLING_INTERVAL,
      mockPlatform,
    );
    const iterator = stream[Symbol.asyncIterator]();

    // Process the first batch
    const item1Promise = iterator.next();
    const { value: item1 } = await item1Promise;

    expect(item1.id).toBe('1');

    // Advance time to trigger the poll
    const item2Promise = iterator.next();
    await vi.advanceTimersByTimeAsync(POLLING_INTERVAL);
    const { value: item2 } = await item2Promise;
    await iterator.return(undefined);

    expect(requestCount).toBe(2);
    const items = [item1, item2];
    expect(items).toHaveLength(2);
    expect(items[1].type).toBe('sessionCompleted');
  });

  it('should not yield duplicate activities on subsequent polls', async () => {
    let requestCount = 0;
    // The first response contains one activity.
    const poll1Response = {
      activities: [{ name: 'a/1', progressUpdated: { title: 'First' } }],
    };
    // The second response contains the first activity again, plus a new one.
    const poll2Response = {
      activities: [
        { name: 'a/1', progressUpdated: { title: 'First' } }, // Duplicate
        { name: 'a/2', sessionCompleted: {} }, // New
      ],
    };

    server.use(
      http.get(`${BASE_URL}/sessions/${SESSION_ID}/activities`, () => {
        requestCount++;
        if (requestCount > 1) {
          return HttpResponse.json(poll2Response);
        }
        return HttpResponse.json(poll1Response);
      }),
    );

    const stream = streamActivities(
      SESSION_ID,
      apiClient,
      POLLING_INTERVAL,
      mockPlatform,
    );
    const iterator = stream[Symbol.asyncIterator]();

    const { value: activity1 } = await iterator.next();

    // Advance time to trigger the poll
    const item2Promise = iterator.next();
    await vi.advanceTimersByTimeAsync(POLLING_INTERVAL);
    const { value: activity2 } = await item2Promise;
    await iterator.return(undefined);

    const activities = [activity1, activity2];

    // Check the final state.
    expect(requestCount).toBe(2);
    expect(activities).toHaveLength(2); // Should not be 3
    expect(activities.map((a) => a.id)).toEqual(['1', '2']);
  });
});
