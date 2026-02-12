
import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import { server } from './mocks/server.js';
import { http, HttpResponse } from 'msw';
import { ApiClient } from '../src/api.js';
import { streamActivities } from '../src/streaming.js';
import { createSourceManager } from '../src/sources.js';
import { mockPlatform } from './mocks/platform.js';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const API_KEY = 'test-api-key';
const BASE_URL = 'https://jules.googleapis.com/v1alpha';
const SESSION_ID = 'retry-session-123';
const POLLING_INTERVAL = 100;

describe('Retry Logic Reproduction', () => {
  const apiClient = new ApiClient({
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    requestTimeoutMs: 1000,
  });

  // Use fake timers to speed up retries
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('streamActivities should retry on 404 during the first call', async () => {
    let requestCount = 0;
    const activitiesResponse = {
      activities: [{ name: 'a/1', id: '1', createTime: '2023-01-01T00:00:00Z', progressUpdated: { title: 'Success' } }],
    };

    server.use(
      http.get(`${BASE_URL}/sessions/${SESSION_ID}/activities`, () => {
        requestCount++;
        if (requestCount === 1) {
          // Simulate 404 on first attempt
          return new HttpResponse(null, { status: 404 });
        }
        return HttpResponse.json(activitiesResponse);
      }),
    );

    const stream = streamActivities(
      SESSION_ID,
      apiClient,
      POLLING_INTERVAL,
      mockPlatform,
    );
    const iterator = stream[Symbol.asyncIterator]();

    // Start the generator
    const nextPromise = iterator.next();

    // Advance time enough to cover retries (initial delay 1000ms + backoff)
    await vi.advanceTimersByTimeAsync(5000);

    const result = await nextPromise;
    await iterator.return(undefined);

    // Should have retried at least once
    expect(requestCount).toBeGreaterThan(1);

    // Should eventually succeed
    expect(result.value).toBeDefined();
    expect(result.value.id).toBe('1');
  });

  it('SourceManager.get should retry on 404 before returning undefined', async () => {
    let requestCount = 0;
    const sourceResponse = {
      name: 'sources/github/owner/repo',
      id: 'owner/repo',
      githubRepo: { owner: 'owner', repo: 'repo', isPrivate: false },
    };

    server.use(
      http.get(`${BASE_URL}/sources/github/owner/repo`, () => {
        requestCount++;
        if (requestCount === 1) {
           // Simulate 404 on first attempt
           return new HttpResponse(null, { status: 404 });
        }
        return HttpResponse.json(sourceResponse);
      }),
    );

    const sources = createSourceManager(apiClient);

    // Start the request
    const promise = sources.get({ github: 'owner/repo' });

    // Advance time to allow retries
    await vi.advanceTimersByTimeAsync(5000);

    const result = await promise;

    // We expect it to retry and eventually succeed
    expect(requestCount).toBeGreaterThan(1);
    expect(result).toBeDefined();
    expect(result?.id).toBe('owner/repo');
  });
});
